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
		const pair = '0xE98f89a2B3AeCDBE2118202826478Eb02434459A';
		const debasePolicy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const rewardPercentage = parseUnits('1550665', 9);
		const multiSigAddress = '0xf038C1cfaDAce2C0E5963Ab5C0794B9575e1D2c2';
		const multiSigShare = parseUnits('2', 17);
		const stabilityPercentage = parseUnits('5', 17);

		const duration = 45000;
		const userLpLimit = parseEther('5');
		const userLpEnabled = true;
		const poolLpLimit = parseEther('70');
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
