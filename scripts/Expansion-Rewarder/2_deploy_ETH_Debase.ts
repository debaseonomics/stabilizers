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

		const debase = '0x9248c485b0B80f76DA451f167A8db30F33C70907';
		const pair = '0xa8e5533d1e22be2df5e9ad9f67dd22a4e7d5b371';
		const debasePolicy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const rewardPercentage = parseUnits('5', 17);
		const multiSigAddress = '0xf038C1cfaDAce2C0E5963Ab5C0794B9575e1D2c2';
		const multiSigShare = parseUnits('2', 17);
		const stabilityPercentage = parseUnits('5', 17);
		
        const duration = 25;
		const userLpLimit = parseEther('20');
        const userLpEnabled = true
		const poolLpLimit = parseEther('50');
        const poolLpEnabled = true

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
