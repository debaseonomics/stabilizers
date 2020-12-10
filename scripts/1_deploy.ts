import { run, ethers } from 'hardhat';

import RandomizedCounterArtifact from '../artifacts/contracts/Randomized-Threshold-Counter/RandomizedCounter.sol/RandomizedCounter.json';
import DebaseArtifact from '../artifacts/contracts/Mock/Token.sol/Debase.json';

import { RandomizedCounterFactory } from '../typechain/RandomizedCounterFactory';
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

		const debaseFactory = (new ethers.ContractFactory(
			DebaseArtifact.abi,
			DebaseArtifact.bytecode,
			signer[0]
		) as any) as DebaseFactory;

		const randomizedCounter = await randomizedCounterFactory.deploy();
		const debase = await debaseFactory.deploy('DEBASE', 'DEBASE');

		console.log(randomizedCounter.address, debase.address);

		const tx = await randomizedCounter.initialize(
			'Random Counter',
			debase.address,
			'0xc7ad46e0b8a400bb3c915120d284aafba8fc4735',
			'0x313bbB5Da55f6087f62DDa5329B5e466698C4D48',
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
