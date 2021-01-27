import { run, ethers } from 'hardhat';

import RandomizedCounterArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/RandomizedCounter.sol/RandomizedCounter.json';
import RandomNumberConsumerArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/RandomNumberConsumer.sol/RandomNumberConsumer.json';
import TokenArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/Mock/Token.sol/Token.json';

import { RandomizedCounterFactory } from '../../typechain/RandomizedCounterFactory';
import { RandomNumberConsumerFactory } from '../../typechain/RandomNumberConsumerFactory';
import { TokenFactory } from '../../typechain/TokenFactory';

import { parseEther, parseUnits } from 'ethers/lib/utils';

async function main() {
	const signer = await ethers.getSigners();

	try {
		const randomizedCounterFactory = (new ethers.ContractFactory(
			RandomizedCounterArtifact.abi,
			RandomizedCounterArtifact.bytecode,
			signer[0]
		) as any) as RandomizedCounterFactory;

		const randomNumberConsumerFactory = (new ethers.ContractFactory(
			RandomNumberConsumerArtifact.abi,
			RandomNumberConsumerArtifact.bytecode,
			signer[0]
		) as any) as RandomNumberConsumerFactory;

		const debaseFactory = (new ethers.ContractFactory(
			TokenArtifact.abi,
			TokenArtifact.bytecode,
			signer[0]
		) as any) as TokenFactory;

		const debase = await debaseFactory.deploy('DEBASE', 'DEBASE');

		const vrfCoordinator = '0xf0d54349aDdcf704F77AE15b96510dEA15cb7952';
		const keyHash = '0xAA77729D3466CA35AE8D28B3BBAC7CC36A5031EFDC430821C02BC31A238AF445';
		const link = '0x514910771af9ca656af840dff83e8264ecf986ca';
		const multiSig = '0xf038C1cfaDAce2C0E5963Ab5C0794B9575e1D2c2';
		const fee = parseUnits('2');
		const degovEthLp = '0xfc835d90ea6557b57b29361d95c4584d389e6ee8';
		const debasePolicy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const rewardPercentage = parseUnits('55', 14);
		const duration = 60 * 60 * 24 * 7;
		const userLpLimit = parseEther('1000');
		const poolLpLimit = parseEther('30000');
		const revokeRewardPercentage = parseUnits('28', 16);
		const normalDistributionMean = 5;
		const normalDistributionDiv = 2;
		//prettier-ignore
		const normalDistribution = [8, 5, 4, 7, 10, 7, 5, 5, 3, 8, 5, 5, 3, 8, 4, 6, 5, 5, 3, 7, 6, 9, 8, 7, 6, 6, 5, 8, 6, 2, 8, 9, 5, 5, 4, 3, 8, 1, 5, 5, 5, 3, 5, 4, 8, 5, 6, 3, 4, 1, 3, 4, 3, 6, 4, 6, 5, 7, 6, 7, 5, 4, 1, 5, 6, 5, 7, 9, 3, 5, 4, 7, 3, 8, 7, 5, 5, 8, 0, 7, 4, 3, 6, 6, 4, 4, 5, 2, 4, 6, 6, 8, 8, 3, 7, 6, 7, 4, 4, 6]

		const randomizedCounter = await randomizedCounterFactory.deploy();
		const randomNumberConsumer = await randomNumberConsumerFactory.deploy(
			multiSig,
			randomizedCounter.address,
			vrfCoordinator,
			link,
			keyHash,
			fee
		);

		const tx = await randomizedCounter.initialize(
			debase.address,
			degovEthLp,
			debasePolicy,
			randomNumberConsumer.address,
			link,
			rewardPercentage,
			duration,
			true,
			userLpLimit,
			true,
			poolLpLimit,
			revokeRewardPercentage,
			normalDistributionMean,
			normalDistributionDiv,
			normalDistribution
		);

		await tx.wait(1);
		await randomizedCounter.setBeforePeriodFinish(true);

		console.log(randomizedCounter.address, randomNumberConsumer.address);
	} catch (error) {
		console.error(error);
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
