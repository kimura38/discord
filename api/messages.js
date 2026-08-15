export default async function handler(req, res) {
  // リクエストからチャンネルIDを受け取る
  const { channelId } = req.query;
  
  // いただいたBotトークンを直接指定しています
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

  if (!channelId) {
    return res.status(400).json({ error: 'channelIdが指定されていません' });
  }

  try {
    // DiscordのAPIにリクエストを送って、メッセージを最新50件取得する
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, {
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error('Discord APIエラー');
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'メッセージの取得に失敗しました' });
  }
}
