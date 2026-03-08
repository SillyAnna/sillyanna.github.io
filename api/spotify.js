export default async function handler(req, res) {
    // Only allow YOUR website to ask for the data! If someone else uses this link, it throws an error.
    res.setHeader('Access-Control-Allow-Credentials', true);
    
    // Check if the request is actually coming from your github pages site
    const origin = req.headers.origin;
    if (origin === 'https://sillyanna.github.io' || origin === 'http://localhost:3000') {
         res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
         return res.status(403).json({ error: "Access Denied. You are not sillyanna.github.io."});
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // These environment variables are safely hidden in Vercel - NEVER printed to the browser!
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

    // Check if variables are missing and print to Vercel logs
    if (!clientId || !clientSecret || !refreshToken) {
        console.error("CRITICAL ERROR: One or more Spotify environment variables are missing in Vercel!");
        return res.status(500).json({ error: 'Missing environment variables. Did you add them in Vercel Settings?' });
    }

    const getAccessToken = async () => {
        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(clientId.trim() + ':' + clientSecret.trim()).toString('base64')
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                })
            });

            if (!response.ok) {
                const errorDetails = await response.text();
                throw new Error(`Spotify API rejected the token refresh. Status: ${response.status}. Details: ${errorDetails}`);
            }
            const data = await response.json();
            return data.access_token;
        } catch (error) {
            console.error("Auth Error:", error);
            return null;
        }
    };

    const accessToken = await getAccessToken();
    if (!accessToken) {
        return res.status(500).json({ error: 'Failed to authenticate with Spotify' });
    }

    try {
        let response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (response.status === 204 || response.status > 400) {
            response = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const data = await response.json();
            if (data.items && data.items.length > 0) {
                return res.status(200).json({ track: data.items[0].track, is_playing: false });
            } else {
                return res.status(200).json({ track: null, is_playing: false });
            }
        } else {
            const data = await response.json();
            return res.status(200).json({ track: data.item, is_playing: data.is_playing });
        }
    } catch (error) {
        console.error("Spotify Fetch Error:", error);
        return res.status(500).json({ error: 'Failed to fetch Spotify status' });
    }
}
