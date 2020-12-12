import { run, ethers } from 'hardhat';

import RandomizedCounterArtifact from '../artifacts/contracts/Randomized-Threshold-Counter/RandomizedCounter.sol/RandomizedCounter.json';
import TokenArtifact from '../artifacts/contracts/Randomized-Threshold-Counter/Mock/Token.sol/Token.json';
import RandomNumberConsumerArtifact from '../artifacts/contracts/Randomized-Threshold-Counter/RandomNumberConsumer.sol/RandomNumberConsumer.json';

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
			TokenArtifact.abi,
			TokenArtifact.bytecode,
			signer[0]
		) as any) as DebaseFactory;

		const randomizedCounter = await randomizedCounterFactory.deploy();
		const randomNumberConsumer = await randomNumberConsumerFactory.deploy(
			'0xdD3782915140c8f3b190B5D67eAc6dc5760C46E9',
			'0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4',
			'0xa36085f69e2889c224210f603d836748e7dc0088',
			'0x313bbB5Da55f6087f62DDa5329B5e466698C4D48',
			randomizedCounter.address
		);
		const debase = await debaseFactory.deploy('DEBASE', 'DEBASE');

		const tx = await randomizedCounter.initialize(
			debase.address,
			'0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa',
			'0x313bbB5Da55f6087f62DDa5329B5e466698C4D48',
			randomNumberConsumer.address,
			'0xa36085f69e2889c224210f603d836748e7dc0088',
			parseEther('10'),
			60 * 60 * 24,
			parseEther('5'),
			parseEther('10'),
			60 * 60 * 6,
			8,
			0,
			//prettier-ignore
			[8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]
		);

		console.log(randomizedCounter.address);
	} catch (error) {
		console.error(error);
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
