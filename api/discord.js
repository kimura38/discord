export default async function handler(req, res) {
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const GUILD_ID = "1527997892449796176"; // 村サーバーのID
  
  try {
    // ① チャンネル一覧の取得（親チャンネルとスレッドの関係を整理して返す）
    if (req.method === 'GET' && req.query.action === 'getChannels') {
      const cRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
      const channels = await cRes.json();
      
      const tRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/threads/active`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
      const threadsData = await tRes.json();
      const threads = threadsData.threads || [];
      
      let list = [];
      if (Array.isArray(channels)) {
        const mainChannels = channels.filter(c => c.type === 0 || c.type === 5 || c.type === 15);
        mainChannels.sort((a, b) => a.position - b.position);
        
        mainChannels.forEach(c => {
          // 親チャンネル
          list.push({ id: c.id, name: c.name, type: c.type, isThread: false, parentId: null });
          
          // このチャンネルに属するスレッドを探す
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
    
    // ③ メッセージ・画像・スレッドの送信（Webhook方式）
    if (req.method === 'POST') {
      const { action, channelId, content, username, avatar_url, imageBase64, imageName, threadName } = req.body;
      if (action === 'sendMessage') {
        
        // チャンネル情報を取得してスレッドかどうか判定
        const chRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
        const channel = await chRes.json();
        
        if (channel.message) throw new Error('チャンネルの取得に失敗しました。Botの権限を確認してください。');

        const isThread = [10, 11, 12].includes(channel.type);
        const parentId = isThread ? channel.parent_id : channelId;
        
        // 親チャンネルのWebhookを取得
        let hooksRes = await fetch(`https://discord.com/api/v10/channels/${parentId}/webhooks`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
        let hooks = await hooksRes.json();
        let webhook = Array.isArray(hooks) ? hooks.find(h => h.token) : null;
        
        // Webhookが存在しない場合は新規作成
        if (!webhook) {
          let createRes = await fetch(`https://discord.com/api/v10/channels/${parentId}/webhooks`, {
            method: 'POST',
            headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: "村サーバー WebChat" })
          });
          webhook = await createRes.json();
          if (!webhook.id) throw new Error('Webhookの作成に失敗しました。Botに「Webhookの管理」権限が必要です。');
        }
        
        // Webhook URLの構築 (既存スレッド宛ての場合はクエリパラメータを付与)
        let url = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
        if (isThread) url += `?thread_id=${channelId}`;

        let safeAvatarUrl = avatar_url;
        if (safeAvatarUrl && safeAvatarUrl.startsWith('data:')) {
          safeAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff`;
        }

        // 送信ペイロードの作成
        const payload = { 
          username: username, 
          avatar_url: safeAvatarUrl, 
          content: content || "" 
        };

        // ★修正ポイント：新規スレッド作成時、thread_nameはpayload_jsonの中に含める
        if (threadName && !isThread) {
          payload.thread_name = threadName;
        }

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify(payload));
        
        // 画像の添付処理
        if (imageBase64) {
          try {
            const base64Response = await fetch(imageBase64);
            const blob = await base64Response.blob();
            formData.append('file', blob, imageName || 'image.png');
          } catch (e) {
            throw new Error('画像の変換処理に失敗しました。');
          }
        }

        // WebhookへPOST送信
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
