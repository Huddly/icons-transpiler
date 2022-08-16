import fs from 'fs';
import path from 'path';
import prettier from 'prettier';
import camelCase from 'camelcase';
import { exists, mkdir, rm, readDir, readFile, writeFile, prettierOptions, logTranspileResult } from './utils';
import * as ts from 'typescript';

interface Options {
	projectDir: string;
	entry: string;
	output: string;
	generate: string[];
}

interface GeneratedFiles {
	name: string;
	file: string;
}

export default async function main(options: Options) {
	const outputDir = path.resolve(options.output);
	if (!(await exists(outputDir))) {
		await mkdir(outputDir);
	}

	const folders = ['.'];
	const allFilesAndFolders = await readDir(options.entry);
	folders.push(...allFilesAndFolders.filter((file) => fs.lstatSync(path.join(options.entry, file)).isDirectory()));

	const generatedFiles = [];
	const generatedIndexFiles = [];

	const collidingFolderNames = folders.find((folder) => path.resolve(folder) === path.resolve(options.entry));
	if (collidingFolderNames) {
		const absCollidingFolder = path.resolve(collidingFolderNames);
		console.error(
			`Error! Folder "${absCollidingFolder}" can't be the same name as the entry folder "${options.entry}."`
		);
		return;
	}

	for (const folder of folders) {
		const allFilesInFolder = await readDir(path.join(options.entry, folder));
		const svgFiles = allFilesInFolder.filter((file) => file.endsWith('.svg'));
		if (!svgFiles.length) continue;

		if (folder !== '.') {
			if (await exists(path.resolve(options.output, folder))) {
				await rm(path.resolve(options.output, folder), { recursive: true });
			}
			await mkdir(path.resolve(options.output, folder));
		}

		const componentNamesForIndex: string[] = [];

		const outputPath = path.join(options.output, folder);

		for (const svgFile of svgFiles) {
			const svgFilePath = path.join(options.entry, folder, svgFile);
			const svgFileNameWithoutExtension = svgFile.replace(/\.svg$/, '');
			const svgFileContent = await readFile(svgFilePath, 'utf8');
			const componentName = camelCase(svgFileNameWithoutExtension, { pascalCase: true });

			componentNamesForIndex.push(componentName);

			mkdir(path.resolve(outputPath, componentName));

			// Create react component?
			if (options.generate.includes('react')) {
				const reactRes = await createReactComponent(
					svgFileContent,
					path.resolve(outputPath, componentName, 'index.tsx'),
					componentName
				);
				generatedFiles.push(reactRes);
			}

			// Create vue component?
			if (options.generate.includes('vue')) {
				const vueRes = await createVueComponent(
					svgFileContent,
					path.resolve(outputPath, componentName, 'index.vue'),
					componentName
				);
				generatedFiles.push(vueRes);
			}
		}

		// Generate an index file for this folder
		const indexFilePath = await createIndexFile(componentNamesForIndex, path.resolve(options.output, folder));
		generatedIndexFiles.push(indexFilePath);
	}

	compileTsToJs(generatedIndexFiles, {
		allowSyntheticDefaultImports: true,
		declaration: true,
		jsx: ts.JsxEmit.ReactJSX,
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES5,
	});

	await logTranspileResult(generatedFiles);
}

async function createIndexFile(components: string[], outputDir: string): Promise<string> {
	const indexFile = path.join(outputDir, 'index.ts');
	let out = '';
	for (const componentName of components) {
		out += `export { default as ${componentName}} from './${componentName}';\n`;
	}
	out = prettier.format(out, prettierOptions);
	await writeFile(indexFile, out);
	return indexFile;
}

async function createReactComponent(
	svgContent: string,
	outputFile: string,
	componentName: string
): Promise<GeneratedFiles> {
	let out = `
	import React from 'react';

	export interface Props {
		className?: string;
		color?: string; 
		title?: string;
	}

	const ${componentName} = ({className, color = '#262626', title = '${componentName} icon'}: Props) => {
		return (${svgContent});
	};
	
	export default ${componentName};
	`;

	out = convertDataAttributesToJsxAttributes(out);
	out = addProp('fill', 'color', 'path', out, 'jsx');
	out = addProp('className', 'className', 'svg', out, 'jsx');
	out = addElement('title', `{title}`, 'path', out);

	out = prettier.format(out, prettierOptions);
	try {
		await writeFile(outputFile, out);
		return { name: componentName, file: outputFile };
	} catch (e) {
		console.error(e);
	}
}

async function createVueComponent(
	svgContent: string,
	outputFile: string,
	componentName: string
): Promise<GeneratedFiles> {
	let out = `
	<script lang="ts">
	import { defineComponent } from 'vue'

	export default defineComponent({
		name: '${componentName}',
		props: {
			color: {
				type: String,
				default: '#262626',
			},
			title: {
				type: String,
				default: '${componentName} icon',
			},
		},
	})
	</script>

	<template>
		${svgContent}
	</template>
	`;

	out = addProp('fill', "color || '#262626'", 'path', out, 'vue');
	out = addElement('title', `{{title || '${componentName} icon'}}`, 'path', out);

	out = prettier.format(out, {
		...prettierOptions,
		parser: 'vue',
	});
	try {
		await writeFile(outputFile, out);
		return { name: componentName, file: outputFile };
	} catch (e) {
		console.error(e);
	}
}

function convertDataAttributesToJsxAttributes(svg: string): string {
	const dataAttributes = svg.match(/([a-zA-Z0-9-]+)="([^"]+)"/g);
	if (!dataAttributes) return svg;

	for (const dataAttribute of dataAttributes) {
		const [, attributeName, attributeValue] = dataAttribute.match(/([a-zA-Z0-9-]+)="([^"]+)"/)!;
		const jsxAttribute = camelCase(attributeName);
		svg = svg.replace(dataAttribute, `${jsxAttribute}="${attributeValue}"`);
	}

	return svg;
}

function addProp(
	propName: string,
	propValue: string,
	targetElement: string,
	html: string,
	lang: 'jsx' | 'vue'
): string {
	propName = camelCase(propName);

	let fullProp;
	switch (lang) {
		case 'jsx':
			fullProp = `${propName}={${propValue}}`;
			break;
		case 'vue':
			fullProp = `:${propName}="${propValue}"`;
			break;
	}

	let targetHtml = html.match(new RegExp(`<${targetElement}([^>]*)>`, 'g'))![0];
	if (targetHtml.indexOf(`${propName}="`) > -1) {
		targetHtml = targetHtml.replace(new RegExp(`${propName}="[^"]+"`, 'g'), fullProp);
	} else {
		targetHtml = targetHtml.replace(new RegExp(`/>|>`, 'g'), ` ${fullProp}$&`);
	}

	html = html.replace(new RegExp(`<${targetElement}([^>]*)>`, 'g'), targetHtml);
	return html;
}

function addElement(elementName: string, elementContent: string, siblingElement: string, html: string): string {
	elementName = camelCase(elementName);
	const fullElement = `<${elementName}>${elementContent}</${elementName}>`;

	const siblingElementIndex = html.indexOf(`<${siblingElement}`);
	if (siblingElementIndex === -1) {
		return html.replace(/<\/svg>/, `${fullElement}</svg>`);
	}
	return html.replace(`<${siblingElement}`, `${fullElement}<${siblingElement}`);
}

function compileTsToJs(fileNames: string[], options: ts.CompilerOptions): string[] {
	options.listEmittedFiles = true;
	const program = ts.createProgram(fileNames, options);
	const emitResult = program.emit();

	const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
	allDiagnostics.forEach((diagnostic) => {
		if (diagnostic.file) {
			let { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
			let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
			console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
		} else {
			console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
		}
	});

	return emitResult.emittedFiles;
}
