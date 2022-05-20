import path from 'path';
import svgToReactComponent from './svg-to-react-component';
import svgToReadme from './svg-to-readme';
import { exists, readFile } from './utils';

interface Options {
	entry: string;
	output: string;
	readme?: {
		output: string;
		template?: string;
	};
}

export async function main(args: Array<any>) {
	const options = await getOptions(process.cwd());

	switch (args[2]) {
		case 'build':
		case undefined:
			await svgToReactComponent({
				entry: options.entry,
				output: options.output,
			});
			break;
		case 'readme':
			if (options.readme) {
				await svgToReadme({
					entry: options.entry,
					output: options.readme.output,
					template: options.readme.template,
				});
			}
			break;
		default:
			console.error('Unknown mode');
			break;
	}
}

async function getOptions(workingDir: string): Promise<Options> {
	const defaultOptions: Options = {
		entry: 'src',
		output: 'dist',
		readme: undefined,
	};

	const config = path.resolve(workingDir, 'build.config.json');
	if (!(await exists(config))) {
		console.warn('build.config.js not found, using default options');
	}
	const parsedConfig = JSON.parse(await readFile(config, 'utf8'));

	const configObject = {
		...defaultOptions,
		...parsedConfig,
	};

	if (!(await exists(configObject.entry))) {
		throw new Error('Entry folder does not exist');
	}

	return configObject;
}
