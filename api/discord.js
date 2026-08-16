export default async function handler(req, res) {
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const GUILD_ID = "1527997892449796176"; // 村サーバーのID
  
  try {
    // ① チャンネル一覧の取得
    if (req.method === 'GET' && req.query.action === 'getChannels') {
      const cRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
      const channels = await cRes.json();
      
      const tRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/threads/active`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
      const threadsData = await tRes.json();
      const threads = threadsData.threads || [];
      
      let list = [];
      if (Array.isArray(channels)) {
        // type 0: Text, 5: Announcement, 15: Forum
        const mainChannels = channels.filter(c => c.type === 0 || c.type === 5 || c.type === 15);
        mainChannels.sort((a, b) => a.position - b.position);
        
        mainChannels.forEach(c => {
          list.push({ id: c.id, name: c.name, type: c.type, isThread: false, parentId: null });
          const childThreads = threads.filter(t => t.parent_id === c.id);
          childThreads.forEach(t => {
            list.push({ id: t.id, name: t.name, type: t.type, isThread: true, parentId: c.id });
          });
        });
      }
      return res.status(200).json(list);
    }
    
    // ② メッセージ履歴の取得
    if (req.method === 'GET' && req.query.action === 'getMessages') {
      const { channelId } = req.query;
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
      return res.status(200).json(await response.json());
    }
    
    // ③ 各種アクションの実行 (送信・削除・編集)
    if (req.method === 'POST') {
      const { action } = req.body;
      
      // ▼ メッセージ削除処理 (Bot権限を利用)
      if (action === 'deleteMessage') {
        const { channelId, messageId } = req.body;
        const delRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bot ${BOT_TOKEN}` }
        });
        if (!delRes.ok) throw new Error('メッセージの削除に失敗しました。');
        return res.status(200).json({ success: true });
      }

      // ▼ メッセージ編集処理 (Webhook APIを利用)
      if (action === 'editMessage') {
        const { channelId, messageId, content } = req.body;
        
        const chRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
        const channel = await chRes.json();
        
        const isThread = [10, 11, 12].includes(channel.type);
        const parentId = isThread ? channel.parent_id : channelId;
        
        // メッセージを編集するためには対象WebhookのTokenが必要
        let hooksRes = await fetch(`https://discord.com/api/v10/channels/${parentId}/webhooks`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
        let hooks = await hooksRes.json();
        let webhook = Array.isArray(hooks) ? hooks.find(h => h.token) : null;
        
        if (!webhook) throw new Error('Webhookが見つかりません。');
        
        let url = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}/messages/${messageId}`;
        if (isThread) url += `?thread_id=${channelId}`;

        const editRes = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content }) // 本文のみ更新
        });
        
        if (!editRes.ok) throw new Error('メッセージの編集に失敗しました。本家Discordから送信された他人のメッセージは編集できません。');
        return res.status(200).json({ success: true });
      }

      // ▼ メッセージ送信処理 (Webhook方式)
      if (action === 'sendMessage') {
        const { channelId, content, username, avatar_url, fileBase64, fileName, threadName } = req.body;
        
        const chRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
        const channel = await chRes.json();
        
        if (channel.message) throw new Error('チャンネルの取得に失敗しました。');

        const isThread = [10, 11, 12].includes(channel.type);
        const parentId = isThread ? channel.parent_id : channelId;
        
        let hooksRes = await fetch(`https://discord.com/api/v10/channels/${parentId}/webhooks`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
        let hooks = await hooksRes.json();
        let webhook = Array.isArray(hooks) ? hooks.find(h => h.token) : null;
        
        if (!webhook) {
          let createRes = await fetch(`https://discord.com/api/v10/channels/${parentId}/webhooks`, {
            method: 'POST',
            headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: "村サーバー WebChat" })
          });
          webhook = await createRes.json();
          if (!webhook.id) throw new Error('Webhookの作成に失敗しました。');
        }
        
        let url = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
        if (isThread) url += `?thread_id=${channelId}`;

        let safeAvatarUrl = avatar_url;
        if (safeAvatarUrl && safeAvatarUrl.startsWith('data:')) {
          safeAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff`;
        }

        const payload = { 
          username: username, 
          avatar_url: safeAvatarUrl, 
          content: content || "" 
        };

        if (threadName && !isThread) {
          payload.thread_name = threadName;
        }

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify(payload));
        
        if (fileBase64) {
          try {
            const base64Response = await fetch(fileBase64);
            const blob = await base64Response.blob();
            formData.append('file', blob, fileName || 'attachment.file');
          } catch (e) {
            throw new Error('ファイルの変換処理に失敗しました。');
          }
        }

        const sendRes = await fetch(url, { method: 'POST', body: formData });
        if (!sendRes.ok) {
            const errTxt = await sendRes.text();
            throw new Error(`Discord送信エラー: ${errTxt}`);
        }
        return res.status(200).json({ success: true });
      }
    }
    
    res.status(400).json({ error: '無効なリクエストです' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
