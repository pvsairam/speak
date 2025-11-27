# Crypto Confessions

A social platform where you can anonymously share your crypto stories. Your confessions get anchored to the Base blockchain forever.

## What it does

- Share anonymous confessions about your crypto journey
- Vote on confessions from others  
- Permanent storage on Base blockchain
- Works as a Farcaster Mini App inside Warpcast

## Tech Stack

- React + TypeScript frontend
- Express.js backend
- PostgreSQL database (Neon)
- Base blockchain for anchoring
- Chainlink price feeds for ETH/USD conversion

## Getting Started

1. Clone the repo
2. Install dependencies: `npm install`
3. Set up your environment variables (see below)
4. Push database schema: `npm run db:push`
5. Run locally: `npm run dev`
6. Build for production: `npm run build`

## Environment Variables

```
DATABASE_URL=your_postgres_connection_string
SESSION_SECRET=your_session_secret
ADMIN_PASSWORD=your_admin_password
VITE_CONTRACT_ADDRESS=0xE78BC115F795bA294d4F05b2eeAAE82b9D4fBB2a
APP_URL=https://your-deployed-url.com
```

For Farcaster integration (optional):
```
FARCASTER_HEADER=
FARCASTER_PAYLOAD=
FARCASTER_SIGNATURE=
```

## Deploying

Works with Vercel, Railway, or any Node.js hosting. Make sure to set your environment variables in your hosting dashboard.

## Smart Contract

Deployed on Base mainnet at `0xE78BC115F795bA294d4F05b2eeAAE82b9D4fBB2a`

Fee is $1.00 USD per confession, converted to ETH using Chainlink oracle.

## Admin Panel

Access the admin panel at `/admin` to manage fees and moderate content. You'll need the admin password and the contract owner wallet.

## Farcaster Mini App

After deploying:
1. Verify your manifest works at `https://your-url/.well-known/farcaster.json`
2. Go to the Farcaster Developer Dashboard
3. Use the Embed Tool to verify your URL
4. Generate account association by scanning the QR code with Warpcast
5. Add the FARCASTER_HEADER, FARCASTER_PAYLOAD, and FARCASTER_SIGNATURE env vars
6. Redeploy and share your app in Warpcast

## License

MIT
