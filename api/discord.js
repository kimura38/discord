export default async function handler(req, res) {
  // いただいた情報
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const GUILD_ID = "1527997892449796176";
  
  const action = req.query.action || req.body?.action;

  try {
    // ① 全チャンネル一覧を取得する機能
    if (action === 'getChannels') {
      const response = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
        headers: { 'Authorization': `Bot ${BOT_TOKEN}` }
      });
      const channels = await response.json();
      // テキストチャンネル(0)とアナウンスチャンネル(5)だけを抽出し、Discord上の順番通りに並び替え
      const textChannels = channels
        .filter(c => c.type === 0 || c.type === 5)
        .sort((a, b) => a.position - b.position)
        .map(c => ({ id: c.id, name: c.name }));
      return res.status(200).json(textChannels);
    }
    
    // ② メッセージを取得する機能（マイクラの特殊メッセージにも対応できるようそのまま返す）
    if (action === 'getMessages') {
      const { channelId } = req.query;
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, {
        headers: { 'Authorization': `Bot ${BOT_TOKEN}` }
      });
      return res.status(200).json(await response.json());
    }
    
    // ③ メッセージを送信する機能（自動でWebhookを作成・利用してアイコンを維持する）
    if (action === 'sendMessage') {
      const { channelId, content, username, avatar_url } = req.body;
      
      // そのチャンネルにあるWebhookを探す
      let hooksRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, { 
        headers: { 'Authorization': `Bot ${BOT_TOKEN}` } 
      });
      let hooks = await hooksRes.json();
      let webhook = Array.isArray(hooks) ? hooks.find(h => h.token) : null;
      
      // なければ自動で作る
      if (!webhook) {
        let createRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
          method: 'POST',
          headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: "村サーバー WebChat" })
        });
        webhook = await createRes.json();
      }
      
      // Webhookを使って送信
      await fetch(`https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, avatar_url, content })
      });
      return res.status(200).json({ success: true });
    }
    
    res.status(400).json({ error: '無効なリクエストです' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
