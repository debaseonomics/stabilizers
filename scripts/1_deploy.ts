import { run, ethers } from 'hardhat';

import RandomizedCounterArtifact from '../artifacts/contracts/Randomized-Threshold-Counter/RandomizedCounter.sol/RandomizedCounter.json';
import RandomNumberConsumerArtifact from '../artifacts/contracts/Randomized-Threshold-Counter/RandomNumberConsumer.sol/RandomNumberConsumer.json';
import DebaseArtifact from '../artifacts/contracts/Mock/Debase.sol/Debase.json';

import { RandomizedCounterFactory } from '../typechain/RandomizedCounterFactory';
import { RandomNumberConsumerFactory } from '../typechain/RandomNumberConsumerFactory';
import { DebaseFactory } from '../typechain/DebaseFactory';

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

		const debaseFactory = (new ethers.ContractFactory(
			DebaseArtifact.abi,
			DebaseArtifact.bytecode,
			signer[0]
		) as any) as DebaseFactory;

		const randomizedCounter = await randomizedCounterFactory.deploy();
		const debase = await debaseFactory.deploy('DEBASE', 'DEBASE');
		const randomNumberConsumer = await randomNumberConsumerFactory.deploy(
			'0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B',
			'0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4',
			'0x01be23585060835e02b77ef475b0cc51aa1e0709',
			'0x313bbB5Da55f6087f62DDa5329B5e466698C4D48',
			randomizedCounter.address
		);

		const tx = await randomizedCounter.initialize(
			'Random Counter',
			debase.address,
			'0xc7ad46e0b8a400bb3c915120d284aafba8fc4735',
			'0x313bbB5Da55f6087f62DDa5329B5e466698C4D48',
			randomNumberConsumer.address,
			'0x01be23585060835e02b77ef475b0cc51aa1e0709',
			parseEther('100'),
			4 * 24 * 60 * 60
		);

	} catch (error) {
		console.error(error);
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
