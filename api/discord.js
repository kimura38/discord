export default async function handler(req, res) {
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const GUILD_ID = "1527997892449796176"; // 村サーバーのID
  
  try {
    // ① チャンネル一覧の取得（フォーラムのスレッドも綺麗に整理して表示する）
    if (req.method === 'GET' && req.query.action === 'getChannels') {
      const cRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
      const channels = await cRes.json();
      
      const tRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/threads/active`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
      const threadsData = await tRes.json();
      const threads = threadsData.threads || [];
      
      let list = [];
      if (Array.isArray(channels)) {
        // テキスト(0), アナウンス(5), フォーラム(15) を抽出して並び替え
        const mainChannels = channels.filter(c => c.type === 0 || c.type === 5 || c.type === 15);
        mainChannels.sort((a, b) => a.position - b.position);
        
        mainChannels.forEach(c => {
          // 通常のチャンネルをそのまま追加
          if (c.type === 0 || c.type === 5) {
            list.push({ id: c.id, name: c.name });
          }
          
          // このチャンネル(フォーラム含む)に属するスレッドを探して追加
          const childThreads = threads.filter(t => t.parent_id === c.id);
          childThreads.forEach(t => {
            if (c.type === 15) {
              // フォーラム内のスレッドは [フォーラム名] をつける
              list.push({ id: t.id, name: `💬 [${c.name}] ${t.name}` });
            } else {
              // 通常チャンネル内のスレッドは字下げして分かりやすくする
              list.push({ id: t.id, name: ` ↳ 💬 ${t.name}` });
            }
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
    
    // ③ メッセージと画像の送信
    if (req.method === 'POST') {
      const { action, channelId, content, username, avatar_url, imageBase64, imageName } = req.body;
      if (action === 'sendMessage') {
        
        const chRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
        const channel = await chRes.json();
        
        if (channel.message) throw new Error('チャンネルの取得に失敗しました。Botの権限を確認してください。');

        let isThread = [10, 11, 12].includes(channel.type);
        let parentId = isThread ? channel.parent_id : channelId;
        
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

        // アイコン処理: 画像ファイル(Base64)が設定された場合は、名前からイニシャル画像を生成して割り当てる
        let safeAvatarUrl = avatar_url;
        if (safeAvatarUrl && safeAvatarUrl.startsWith('data:')) {
          safeAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff`;
        }

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ 
          username: username, 
          avatar_url: safeAvatarUrl, 
          content: content || "" 
        }));
        
        // 画像送信処理の修正: サーバー環境でエラーが起きないよう、fetchを使ってBlobに変換する
        if (imageBase64) {
          try {
            const base64Response = await fetch(imageBase64);
            const blob = await base64Response.blob();
            formData.append('file', blob, imageName || 'image.png');
          } catch (e) {
            throw new Error('画像の変換処理に失敗しました。');
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
