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

		const debase = '0x9248c485b0B80f76DA451f167A8db30F33C70907';
		const mph88 = '0x8888801af4d980682e47f1a9036e589479e835c5';
		const crv = '0xD533a949740bb3306d119CC777fa900bA034cd52';
		const pair = '0xa8e5533d1e22be2df5e9ad9f67dd22a4e7d5b371';
		const policy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const mph88Reward = parseEther('1');
		const crvReward = parseEther('1');
		const rewardPercentage = parseUnits('1', 12);
		const blockDuration = 10;
		const multiSigReward = 0;
		const treasury = '0xbF402010972809A0756dCB536a455Ca9a0d6a9C1';
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
