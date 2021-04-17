import { run, ethers } from 'hardhat';

import ExpansionRewarderArtifact from '../../artifacts/contracts/Expansion-Rewarder/ExpansionRewarder.sol/ExpansionRewarder.json';
import { ExpansionRewarderFactory } from '../../typechain/ExpansionRewarderFactory';

import { parseEther, parseUnits } from 'ethers/lib/utils';

async function main() {
	const signer = await ethers.getSigners();

	try {
		const expansionFactory = (new ethers.ContractFactory(
			ExpansionRewarderArtifact.abi,
			ExpansionRewarderArtifact.bytecode,
			signer[0]
		) as any) as ExpansionRewarderFactory;

		const debase = '0xcef9b7df27f06b9a2d1decc45b23930e3fc6a9a9';
		const pair = '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa';
		const debasePolicy = '0x47Be788Bfc350EDca196C6a20020e0A708dd9bee';
		const rewardPercentage = parseUnits('5', 17);
		const multiSigAddress = '0x47Be788Bfc350EDca196C6a20020e0A708dd9bee';
		const multiSigShare = parseUnits('2', 17);
		const stabilityPercentage = parseUnits('5', 17);

		const duration = 100;
		const userLpLimit = parseEther('20');
		const userLpEnabled = true;
		const poolLpLimit = parseEther('50');
		const poolLpEnabled = true;

		const expansion = await expansionFactory.deploy(
			debase,
			pair,
			debasePolicy,
			rewardPercentage,
			duration,
			stabilityPercentage,
			multiSigShare,
			multiSigAddress,
			userLpEnabled,
			userLpLimit,
			poolLpEnabled,
			poolLpLimit
		);

		console.log(expansion.address);
	} catch (error) {
		console.error(error);
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
