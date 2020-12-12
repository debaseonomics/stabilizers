import { run, ethers } from 'hardhat';

import RandomizedCounterArtifact from '../artifacts/contracts/Randomized-Threshold-Counter/RandomizedCounter.sol/RandomizedCounter.json';
import RandomNumberConsumerArtifact from '../artifacts/contracts/Randomized-Threshold-Counter/RandomNumberConsumer.sol/RandomNumberConsumer.json';

import { RandomizedCounterFactory } from '../typechain/RandomizedCounterFactory';
import { RandomNumberConsumerFactory } from '../typechain/RandomNumberConsumerFactory';

import { parseEther } from 'ethers/lib/utils';

async function main() {
	await run('typechain');
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

		const vrfCordinator = '0xf0d54349aDdcf704F77AE15b96510dEA15cb7952';
		const keyHash = '0xAA77729D3466CA35AE8D28B3BBAC7CC36A5031EFDC430821C02BC31A238AF445';
		const link = '0x514910771af9ca656af840dff83e8264ecf986ca';
		const multiSig = '0x313bbB5Da55f6087f62DDa5329B5e466698C4D48';
		const fee = parseEther('2');
		const debase = '0x9248c485b0B80f76DA451f167A8db30F33C70907';
		const debaseDaiLp = '0xE98f89a2B3AeCDBE2118202826478Eb02434459A';
		const debasePolicy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const rewardAmount = parseEther('100');
		const duration = 60 * 60 * 24;
		const userLpLimit = parseEther('1000');
		const poolLpLimit = parseEther('10000');
		const revokeRewardDuration = 60 * 60 * 6;
		const normalDistributionMean = 10;
		const normalDistributionDiv = 1;
		//prettier-ignore
		const normalDistribution = [10, 11, 13, 10, 11, 9, 11, 9, 10, 9, 10, 9, 11, 11, 11, 11, 12, 9, 9, 11, 10, 8, 10, 11, 9, 10, 11, 9, 10, 11, 11, 11, 11, 10, 12, 10, 10, 9, 12, 10, 9, 10, 12, 10, 9, 11, 11, 10, 10, 9, 10, 9, 11, 11, 8, 10, 10, 9, 9, 12, 10, 10, 10, 9, 11, 10, 10, 10, 11, 9, 9, 10, 12, 9, 12, 10, 9, 10, 9, 9, 10, 10, 10, 11, 10, 9, 10, 11, 10, 11, 10, 8, 10, 9, 11, 9, 9, 10, 10, 10]

		const randomizedCounter = await randomizedCounterFactory.deploy();
		const randomNumberConsumer = await randomNumberConsumerFactory.deploy(
			vrfCordinator,
			keyHash,
			link,
			multiSig,
			randomizedCounter.address,
			fee
		);

		const tx = await randomizedCounter.initialize(
			debase,
			debaseDaiLp,
			debasePolicy,
			randomNumberConsumer.address,
			link,
			rewardAmount,
			duration,
			userLpLimit,
			poolLpLimit,
			revokeRewardDuration,
			normalDistributionMean,
			normalDistributionDiv,
			normalDistribution
		);

		console.log(randomizedCounter.address, randomNumberConsumer.address);
	} catch (error) {
		console.error(error);
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
