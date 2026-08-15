export default async function handler(req, res) {
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const GUILD_ID = "1527997892449796176"; // 村サーバーのID
  
  try {
    // ① チャンネル一覧の取得（フォーラムのスレッドも取得して表示する）
    if (req.method === 'GET' && req.query.action === 'getChannels') {
      // 通常のチャンネルを取得
      const cRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
      const channels = await cRes.json();
      
      // アクティブなスレッド（フォーラムの投稿など）を取得
      const tRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/threads/active`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
      const threadsData = await tRes.json();
      const threads = threadsData.threads || [];
      
      let list = [];
      if (Array.isArray(channels)) {
        // テキスト(0)とアナウンス(5)を抽出
        list = channels.filter(c => c.type === 0 || c.type === 5).map(c => ({ id: c.id, name: c.name, position: c.position }));
        list.sort((a, b) => a.position - b.position);
      }
      if (Array.isArray(threads)) {
        // スレッドやフォーラムの投稿を「💬」マーク付きで追加
        const threadList = threads.map(t => ({ id: t.id, name: `💬 ${t.name}`, position: 999 }));
        list = list.concat(threadList);
      }
      return res.status(200).json(list);
    }
    
    // ② メッセージ履歴の取得
    if (req.method === 'GET' && req.query.action === 'getMessages') {
      const { channelId } = req.query;
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
      return res.status(200).json(await response.json());
    }
    
    // ③ メッセージと画像の送信（フォーラム・スレッド対応版）
    if (req.method === 'POST') {
      const { action, channelId, content, username, avatar_url, imageBase64, imageName } = req.body;
      if (action === 'sendMessage') {
        
        // チャンネルの情報を取得（スレッドか普通のチャンネルか判定）
        const chRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, { headers: { 'Authorization': `Bot ${BOT_TOKEN}` } });
        const channel = await chRes.json();
        
        if (channel.message) throw new Error('チャンネルの取得に失敗しました。Botの権限を確認してください。');

        // フォーラムやスレッド(10, 11, 12)の場合は、親チャンネルのWebhookを使う
        let isThread = [10, 11, 12].includes(channel.type);
        let parentId = isThread ? channel.parent_id : channelId;
        
        // 親チャンネルのWebhookを探す（無ければ作る）
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
        
        // スレッド宛ての場合はURLの末尾に thread_id をつける
        let url = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
        if (isThread) url += `?thread_id=${channelId}`;

        // 画像とテキストを「FormData」という形式にまとめてDiscordへ送る
        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ username, avatar_url, content: content || "" }));
        
        if (imageBase64) {
          const matches = imageBase64.match(/^data:(.+);base64,(.+)$/);
          if (matches) {
            const buffer = Buffer.from(matches[2], 'base64');
            formData.append('file', new Blob([buffer], { type: matches[1] }), imageName || 'image.png');
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
