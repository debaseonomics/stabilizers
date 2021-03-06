import { run, ethers } from 'hardhat';

import RewarderArtifact from '../../artifacts/contracts/SP1-Liquidity/Rewarder.sol/Rewarder.json';
import { RewarderFactory } from '../../typechain/RewarderFactory';

import { parseEther, parseUnits } from 'ethers/lib/utils';

async function main() {
	const signer = await ethers.getSigners();

	try {
		const rewarderFactory = (new ethers.ContractFactory(
			RewarderArtifact.abi,
			RewarderArtifact.bytecode,
			signer[0]
		) as any) as RewarderFactory;

		const debase = '0x0f2968f1dd68a31f5c45a17faf4a4acd6fc9e783';
		const mph88 = '0x9f810f25a4e3101dea39f3fdd941f7e439941171';
		const crv = '0x374b05aed6ffc294f98859c97a714d2ba16bd13c';
		const pair = '0x6c1dea76a746f6295f33e5738e9015dd4267f533';
		const policy = '0x47Be788Bfc350EDca196C6a20020e0A708dd9bee';
		const mph88Reward = parseEther('1');
		const crvReward = parseEther('1');
		const rewardPercentage = parseUnits('1', 12);
		const blockDuration = 10;
		const multiSigReward = 0;
		const treasury = '0x47Be788Bfc350EDca196C6a20020e0A708dd9bee';
		const contractionPercentage = parseEther('1');

		const rewarder = await rewarderFactory.deploy(
			debase,
			mph88,
			crv,
			pair,
			policy,
			mph88Reward,
			crvReward,
			rewardPercentage,
			blockDuration,
			multiSigReward,
			treasury,
			contractionPercentage
		);

		console.log(rewarder.address);
	} catch (error) {
		console.error(error);
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
