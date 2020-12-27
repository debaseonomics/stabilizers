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

		const vrfCoordinator = '0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B';
		const keyHash = '0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311';
		const link = '0x01be23585060835e02b77ef475b0cc51aa1e0709';
		const multiSig = '0x47Be788Bfc350EDca196C6a20020e0A708dd9bee';
		const fee = parseUnits('1', 17);
		const debaseDaiLp = '0xc7ad46e0b8a400bb3c915120d284aafba8fc4735';
		const debasePolicy = '0x47Be788Bfc350EDca196C6a20020e0A708dd9bee';
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
		const randomNumberConsumer = await randomNumberConsumerFactory.deploy();

		const tx = await randomizedCounter.initialize(
			debase.address,
			debaseDaiLp,
			debasePolicy,
			randomNumberConsumer.address,
			link,
			rewardPercentage,
			duration,
			userLpLimit,
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
