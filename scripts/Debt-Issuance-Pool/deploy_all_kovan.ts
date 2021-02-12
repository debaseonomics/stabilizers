import { ethers } from 'hardhat';

import BurnPoolArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/BurnPool.sol/BurnPool.json';
import OracleArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Oracle.sol/Oracle.json';
import UniswapV2Router02Artifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/UniswapV2Router02.sol/UniswapV2Router02.json';
import IUniswapV2PairArtifact from '../../artifacts/@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol/IUniswapV2Pair.json';

import ERC20Artifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/Debase.sol/ERC20.json';

import { BurnPoolFactory } from '../../typechain/BurnPoolFactory';
import { BurnPool } from '../../typechain/BurnPool';
import { OracleFactory } from '../../typechain/OracleFactory';
import { Erc20 } from '../../typechain/Erc20';
import { IUniswapV2Pair } from '../../typechain/IUniswapV2Pair';
import { UniswapV2Router02 } from '../../typechain/UniswapV2Router02';

import DebaseArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/Mock/Debase.sol/Debase.json';
import { Debase } from '../../typechain/Debase';

import { parseEther, parseUnits } from 'ethers/lib/utils';

async function main() {
	const signer = await ethers.getSigners();
	const account = await signer[0].getAddress();

	try {
		const burnPoolFactory = (new ethers.ContractFactory(
			BurnPoolArtifact.abi,
			BurnPoolArtifact.bytecode,
			signer[0]
		) as any) as BurnPoolFactory;

		const oracleFactory = (new ethers.ContractFactory(
			OracleArtifact.abi,
			OracleArtifact.bytecode,
			signer[0]
		) as any) as OracleFactory;

		const uniswapV2Router = new ethers.Contract(
			'0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
			UniswapV2Router02Artifact.abi,
			signer[0]
		) as UniswapV2Router02;

		const uniswapV2Pair = new ethers.Contract(
			'0xC92C4Ccb10C57Dcedb96ed1d8bB5Db06D0b5a0C2',
			IUniswapV2PairArtifact.abi,
			signer[0]
		) as IUniswapV2Pair;

		const debase = new ethers.Contract(
			'0xcef9b7df27f06b9a2d1decc45b23930e3fc6a9a9',
			DebaseArtifact.abi,
			signer[0]
		) as Debase;

		const dai = new ethers.Contract(
			'0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa',
			ERC20Artifact.abi,
			signer[0]
		) as Erc20;

		// const burnPool = new ethers.Contract(
		// 	'0x477D8221A2D38CC31C296B3340677B43007cbA2b',
		// 	BurnPoolArtifact.abi,
		// 	signer[0]
		// ) as BurnPool;

		const debaseUser = debase.connect(signer[0]);

		const debasePolicy = '0x47Be788Bfc350EDca196C6a20020e0A708dd9bee';
		const burnPool1 = '0xb7493caBdE32B8A875Bd44BC5C27cDdB28d9Eff0';
		const burnPool2 = '0xA32ffF298Bc9DED0a1C2179e3cB7DfA97B5e9C36';
		const epochs = 2;
		const oraclePeriod = 50;
		const curveShifter = 0;
		const initialRewardShare = parseEther('1');
		const multiSig = '0x47Be788Bfc350EDca196C6a20020e0A708dd9bee';
		const multiSigShare = parseEther('1');
		const mean = '0x00000000000000000000000000000000';
		const deviation = '0x3fff609aa6ab2c4acd8e2f11c9afa275';
		const oneDivDeviationSqrtTwoPi = '0x3ffd28981c19c08dc42a6e8e83ae45e6';
		const twoDeviationSquare = '0x4000e5a9a7c429bb0f601a46fe1645e7';

		const burnPool = await burnPoolFactory.deploy();
		const oracle = await oracleFactory.deploy(debase.address, dai.address, burnPool.address);

		await burnPool.initialize(
			debase.address,
			oracle.address,
			debasePolicy,
			burnPool1,
			burnPool2,
			epochs,
			oraclePeriod,
			curveShifter,
			initialRewardShare,
			multiSig,
			multiSigShare,
			mean,
			deviation,
			oneDivDeviationSqrtTwoPi,
			twoDeviationSquare
		);

		//await burnPool.checkStabilizerAndGetReward(0, 10, 0, parseEther('10'));
		await burnPool.checkStabilizerAndGetReward(-1, 10, parseUnits('94', 16), parseEther('10'));
		//await debaseUser.approve(burnPool.address, parseEther('10'));
		//await burnPool.buyCoupons(parseEther('1'));
		//await burnPool.checkStabilizerAndGetReward(parseEther('30000'), 10, parseEther('2'), parseEther('100000'));
		// await burnPool.checkStabilizerAndGetReward(parseEther('30000'), 10, parseEther('2'), parseEther('100000'));
		//await burnPool.checkStabilizerAndGetReward(-1, 10, 0, parseEther('10'));
		//await burnPool.buyCoupons(parseEther('1'));

		console.log(burnPool.address, oracle.address);
	} catch (error) {
		console.error(error);
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
