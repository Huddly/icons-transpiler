import fs from 'fs';
import path from 'path';
import util from 'util';
import { Options as PrettierOptions } from 'prettier';
import CliTable from 'cli-table';

export const exists = util.promisify(fs.exists);
export const readFile = util.promisify(fs.readFile);
export const stat = util.promisify(fs.stat);
export const mkdir = util.promisify(fs.mkdir);
export const readDir = util.promisify(fs.readdir);
export const writeFile = util.promisify(fs.writeFile);
export const rm = util.promisify(fs.rm);

export const basePath = (file: string) => file.replace(/^.*[\\\/]/, '');

export const baseDir = (file: string) =>
	fs.lstatSync(file).isDirectory() ? file.split('/').pop() : file.split('/').slice(-2, -1)[0];

export const prettierOptions: PrettierOptions = {
	parser: 'typescript',
	singleQuote: true,
	trailingComma: 'all',
	printWidth: 100,
	tabWidth: 2,
	useTabs: false,
	semi: true,
	bracketSpacing: true,
};

export async function logTranspileResult(generatedFiles: Array<{ name: string; file: string }>) {
	const table = new CliTable({
		head: ['Index', 'Name', 'Path', 'Size'],
		style: {
			head: ['yellow'],
			border: ['yellow'],
			compact: true,
		},
	});

	await Promise.all(
		generatedFiles.map(async ({ name, file }, i) => {
			const fileSize = await getFileSize(file);
			const fileSizeInKb = Math.round(fileSize / 1024) + 'kb';
			table.push([i, name, file, fileSizeInKb]);
		})
	);

	console.log(`Generated ${table.length} files successfully:`);
	console.log(table.toString());
}

export async function getFileSize(filePath: string) {
	const stats = await stat(filePath);
	return stats.size;
}

export function getPathFromABase(base: string, file: string) {
	const baseRoot = base.split('/')[0];
	const fileArray = file.split('/');
	const newRootIndex = fileArray.findIndex((f) => f === baseRoot);
	if (newRootIndex === -1) {
		throw new Error(`Could not match ${base} to ${file}`);
	}
	fileArray.splice(0, newRootIndex);
	return fileArray.join('/');
}
