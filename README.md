## 🔥 warming_wallets

warming_wallets is an EVM automation tool for preparing and managing multiple wallets through blockchain transactions.

The project allows users to automate wallet activity, send transactions across supported networks, and interact with smart contracts using `ethers.js`.

Built for Web3 automation workflows and testing environments.

⚠️ Never commit real private keys or sensitive data to the repository. Use test wallets only.

## ⚙️ Installation

Clone repository:

```bash
git clone https://github.com/wfofw/warming_wallets.git
cd warming_wallets
```

Install dependencies:

```bash
npm install
```

Before running the script, prepare wallet data in:

[`auxiliaryFiles/walletsForWork.env.example`](./auxiliaryFiles/walletsForWork.env.example)
```env
PRIVATE_KEY="first_key
second_key
third_key
"
```

*Each private key must be written on a new line.*

Configure environment variables in:

[`data.env`](./data.env)
```env
polygon=https://polygon-rpc.com
avalanche=https://1rpc.io/avax/c
blast=https://rpc.ankr.com/blast
optimism=https://1rpc.io/op
```

*You can use public RPC endpoints or provide your own private nodes for better reliability*

Select RPC endpoints that will be used during the warming process:

```env
allRpc=blast,polygon
```
*Only RPC keys listed here will be used during execution*

## 🚀Start:

```bash
node startFile.mjs
```
