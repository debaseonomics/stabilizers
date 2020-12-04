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
		// const randomNumberConsumer = await randomNumberConsumerFactory.deploy('0xdD3782915140c8f3b190B5D67eAc6dc5760C46E9','0xa36085F69e2889c224210F603D836748e7dC0088','0x313bbB5Da55f6087f62DDa5329B5e466698C4D48',randomizedCounter.address)

		await randomizedCounter.initialize(
			'Random',
			debase.address,
			'0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa',
			'0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
			'0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
			parseEther('100'),
			4 * 24 * 60 * 60
		);

		console.log('Counter', randomizedCounter.address);
		console.log('Debase', debase.address);

		await randomizedCounter.setRevokeReward(true);
		await randomizedCounter.setRevokeRewardDuration(60 * 60 * 24);

		await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
		await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
		await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
		await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
		await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
		await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
		await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
		await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
		await debase.transfer(randomizedCounter.address, parseEther('100'));

		await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, 1);
		await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, 1);
		await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, 1);
		await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, 1);



		// console.log("Random",randomNumberConsumer.address)
	} catch (error) {
		console.error(error);
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
