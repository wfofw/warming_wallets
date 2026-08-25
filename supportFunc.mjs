import { ethers } from 'ethers';
import lodash from 'lodash';
import { round } from 'mathjs';
import fs from 'fs';
import { configDotenv } from 'dotenv';
configDotenv({ path: './data.env' });
configDotenv({ path: './auxiliaryFiles/walletsForWork.env' });
configDotenv({ path: './auxiliaryFiles/readyWallets.env' });
import { bebopSwap } from './exchanges/bebop/bebopMain.mjs';

const rpcList = process.env.allRpc.split(',');

export const chainIDList = {
    polygon: {
        id: 137,
        tokens: {
            USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            USDCe: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            MATIC: ethers.ZeroAddress,
            WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        },
        native: {
            symbol: 'MATIC',
            address: ethers.ZeroAddress,
        },
        wrapped: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        bebop: {
            native:'0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
    },
    optimism: {
        id: 10,
        tokens: {
            ETH: ethers.ZeroAddress,
        },
        native: {
            symbol: 'ETH',
            address: ethers.ZeroAddress,
        },
        wrapped: '0x4200000000000000000000000000000000000006'
    },
    blast: {
        id: 81457,
        tokens: {
            USDB: '0x4300000000000000000000000000000000000003',
            ETH: ethers.ZeroAddress,
            WETH: '0x4300000000000000000000000000000000000004'
        },
        native: {
            symbol: 'ETH',
            address: ethers.ZeroAddress,
        },
        wrapped: '0x4300000000000000000000000000000000000004',
    },
    avalanche: {
        id: 43114,
        tokens: {
            AVAX: ethers.ZeroAddress,
            USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
            USDCe: '0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664',
            USDTe: '0xc7198437980c041c805A1EDcbA50c1Ce5db95118',
        },
        native: {
            symbol: 'AVAX',
            address: ethers.ZeroAddress,
        }
    },
}

export const abi = [
    'function balanceOf(address) view returns (uint)',
    'function decimals() view returns (uint)',
    'function symbol() view returns (string)',
    'function approve(address, uint256) returns (bool)',
    'function allowance(address, address) view returns (uint)',
]

export async function writeError(errorStack) {
    fs.appendFile('./auxiliaryFiles/error.log', errorStack+'\n', (err) => {
        if (err) {
            console.error('Failed to write error to file');
        } else {
            console.log('Error successfuly write to file');
        }
    })
}

export async function waitForConfirm(hash, provider) {
    try {
        console.log(`Waiting for tx receipt: ${hash}`);
        // We are waiting for inclusion in the block and 23 confirmations (or transmit the required number)
        const receipt = await provider.waitForTransaction(hash, 23, 60000); // 60 sec timeout
        
        if (receipt && receipt.status === 1) {
            console.log('Tx confirmed successfully!');
            return 1;
        } else {
            console.log('Tx failed or dropped');
            return 0;
        }
    } catch (error) {
        await writeError(error.stack);
        return 0;
    }
}

export async function checkForAllowance(wallet, tokenAddress, approvalAddress, amount, provider) {
    const contract = new ethers.Contract(tokenAddress, abi, wallet);
    const allowance = await contract.allowance(await wallet.getAddress(), approvalAddress);

    if (Number(allowance) < Number(amount)) {
        console.log('Making approve...');
        try {
            console.log('Address for approve:', approvalAddress, '\nToken address:', tokenAddress, '\nAmount to approve:', BigInt(amount), '\nGas price:', Number((await provider.getFeeData()).maxFeePerGas)/10**9)
            const approveTx = await contract.approve(approvalAddress, BigInt(amount), {gasPrice: BigInt(lodash.floor(Number((await provider.getFeeData()).maxFeePerGas)*1.1))});
            console.log(`Waiting for approve...\n${await approveTx.hash}`);
            let confirmRes = await waitForConfirm(approveTx.hash, provider);
            if (confirmRes == 0) {
                console.log('Tx doesn`t exist');
                return 0;
            } else if (confirmRes == 1) {
                console.log('Tx done!');
            } else {
                console.log('Unexpected error');
                return 2;
            }
            console.log('Approve Done!');
        } catch(error) {
            writeError(error.stack);
        }
    } else {
        console.log('Approve unnecessary');
    }
}

export async function getNativeTokenBalance(tokenContract, tokenAddress, provider, address) {
    if (tokenAddress == ethers.ZeroAddress) {
        const balance = await provider.getBalance(address);
        return BigInt(balance);
    } else {
        const balance = await tokenContract.balanceOf(address);
        return BigInt(balance);
    }
}

export async function waitDelay(ms, parametrs, wallet, provider) {
    console.log(`------|Swap started|------`,`\nFrom: ${parametrs.fromToken}\nTo: ${parametrs.toToken}`);
    console.log('Waiting for time delay..', round(ms/1000), 'second');
    return new Promise(resolve => {
        setTimeout(async () => {
            const swapRes = await bebopSwap(parametrs, wallet, provider);
            console.log('------|Swap finished!|------');
            resolve(swapRes);
        }, ms);
    });
}

export function addParametrs(path, parametrs) {
    if (Object.keys(parametrs).length > 0) {
        const queryParams = new URLSearchParams(parametrs);
        path = path+'?'+queryParams;
    };
    return path;
}

export async function backTokenToNative(chain, provider, wallet) {
    console.log('Backing..')
    const timeDelay = lodash.random(60000, 120000);

    const fromChain = chainIDList[chain].id;
    const toChain = fromChain;

    const fromTokensList = Object.keys(chainIDList[chain].tokens).filter(item => item != /*'USDB'*/chainIDList[chain].native.symbol);

    const toToken = chainIDList[chain].native.symbol/*tokens['USDB']*/;

    let initialfromTokenValue;
    let finalFromTokenValue;
    let initialtokenContract;
    let finalTokenContract;
    let tokenAmount;
    let maxAmount = BigInt(0);
    for (let tokenKey of fromTokensList) {
        initialfromTokenValue = chainIDList[chain].tokens[tokenKey];
        initialtokenContract = new ethers.Contract(initialfromTokenValue, abi, provider);
        if (await initialtokenContract.getAddress() == ethers.ZeroAddress) {
            tokenAmount = BigInt(Number(await provider.getBalance(wallet.address)) - 0.00096342*10**18);
        } else {
            tokenAmount = await initialtokenContract.balanceOf(wallet.address);
        }
        if (tokenAmount > maxAmount) {
            maxAmount = tokenAmount;
            finalTokenContract = initialtokenContract;
            finalFromTokenValue = initialfromTokenValue;
        }
    }
    const amount = maxAmount;
    const swapParametrs = {
        amount: amount,
        fromChain: {
            'chainId': fromChain,
            'chainName': chain,
        },
        toChain: {
            'chainId': toChain,
            'chainName': chain,
        },
        fromToken: finalFromTokenValue,
        toToken: toToken,
        tokenContract: finalTokenContract
    };
    if (swapParametrs.fromToken == undefined) {
        console.log('All token transfered to native!');
        return 3;
    }
    await waitDelay(timeDelay, swapParametrs, wallet, provider);
    console.log('Native token successfully refueled!\n');
    return 1;
}

export async function makeAmount(balance, contract) {
    const tokenAddress = await contract.getAddress();
    
    // Checking limits for ETH / WETH
    if (tokenAddress === ethers.ZeroAddress || tokenAddress === '0x4300000000000000000000000000000000000004') {
        if (balance < 0.0094885 * 10**18) return 0;

        let balcWithPrcnt;
        let finalAmount;
        do {
            const percentage = round(lodash.random(0.02, 0.99), 2);
            balcWithPrcnt = BigInt(lodash.floor(balance * percentage));
            finalAmount = Number(balcWithPrcnt) / 10**18;
        } while (finalAmount < 0.0094885);

        return balcWithPrcnt;
    } 
    
    // Checking limits for USDB
    else {
        const decimals = await contract.decimals();
        if (tokenAddress === '0x4300000000000000000000000000000000000003') {
            const minBalance = 24.2718446602 * 10**Number(decimals);
            if (balance < minBalance) return 0;

            let balcWithPrcnt;
            let finalAmount;
            do {
                const percentage = round(lodash.random(0.02, 0.99), 2);
                balcWithPrcnt = BigInt(lodash.floor(balance * percentage));
                finalAmount = Number(balcWithPrcnt) / 10**Number(decimals);
            } while (finalAmount < 24.2718446602);

            return balcWithPrcnt;
        }
    }
    return BigInt(0);
}

async function backAllTokenToNative() {
    // 1. Parsing private keys
    const rawKeys = process.env.PRIVATE_KEYS || '';
    const privateKeyList = rawKeys
        .split('\n')
        .map(key => key.trim())
        .filter(key => key.length >= 64);

    const uniqueKeys = [...new Set(privateKeyList)];
    console.log(`Loaded ${uniqueKeys.length} unique private key(s).`);

    const chain = lodash.sample(rpcList);
    const rpc = process.env[chain];
    const provider = new ethers.JsonRpcProvider(rpc);

    // 2. Parsing ready-made wallets from the READY_WALLETS environment variable
    const rawReadyWallets = process.env.READY_WALLETS || '';
    let walletsAndReturns = rawReadyWallets
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.split(':'));

    let walletsList = walletsAndReturns.map(pair => pair[0]);
    let counter = 0 - uniqueKeys.length;
    let readyWalletsCounter = 0;

    const totalTokensCount = Object.keys(chainIDList[chain].tokens).length - 1;
    const totalIterations = uniqueKeys.length * totalTokensCount;

    for (let i = 0; i < totalIterations; i++) {
        if (readyWalletsCounter === uniqueKeys.length) {
            console.log('All wallets ready!');
            break;
        }

        // 3. Synchronize the state with the readyWallets.env file once per cycle (batch)
        if (i % uniqueKeys.length === 0) {
            counter += uniqueKeys.length;

            const formattedPairs = walletsAndReturns.map(pair => pair.join(':')).join('\n');
            const envContent = `# Auto-updated ready wallets\nREADY_WALLETS="\n${formattedPairs}\n"`;

            fs.writeFileSync(readyWalletsEnvPath, envContent);
            walletsList = walletsAndReturns.map(pair => pair[0]);
        }

        const currentKey = uniqueKeys[i - counter];
        const wallet = new ethers.Wallet(currentKey, provider);

        console.log('-------------------------------------------------------');
        console.log('Wallet:', wallet.address);

        let iterSkip = 0;
        walletsAndReturns.forEach((pair) => {
            if (pair[0] === wallet.address) {
                if (pair[1] === 'allDone') {
                    console.log('Wallet also ready');
                    readyWalletsCounter++;
                    iterSkip = 1;
                }
            }
        });

        if (iterSkip === 1) {
            continue;
        }

        readyWalletsCounter = 0;
        let backingRes = await backTokenToNative('blast', provider, wallet);

        // 4. Updating wallet status directly in the memory array
        const existingPairIndex = walletsAndReturns.findIndex(pair => pair[0] === wallet.address);

        if (backingRes === 1) {
            if (existingPairIndex !== -1) {
                const currentStatus = walletsAndReturns[existingPairIndex][1];
                const currentNum = Number(currentStatus);

                if (!isNaN(currentNum)) {
                    if (currentNum < totalTokensCount) {
                        walletsAndReturns[existingPairIndex][1] = String(currentNum + 1);
                    } else {
                        walletsAndReturns[existingPairIndex][1] = 'allDone';
                        console.log(`All token returned to native!\nWallet ready:${wallet.address}`);
                    }
                }
            } else {
                walletsAndReturns.push([wallet.address, '1']);
            }
        } else if (backingRes === 3) {
            if (existingPairIndex !== -1) {
                walletsAndReturns[existingPairIndex][1] = 'allDone';
            } else {
                walletsAndReturns.push([wallet.address, 'allDone']);
            }
            console.log('All token returned to native!\nWallet ready!');
        }
    }

    // 5. Synchronization with the file after the cycle is completed
    const finalPairs = walletsAndReturns.map(pair => pair.join(':')).join('\n');
    const finalEnvContent = `# Auto-updated ready wallets\nREADY_WALLETS="\n${finalPairs}\n"`;
    fs.writeFileSync(readyWalletsEnvPath, finalEnvContent);
}

backAllTokenToNative();