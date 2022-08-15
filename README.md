# Icons transpiler

A Node script for converting SVG icons to React components.

### Installation & Setup

Run the following command to install the library:

```bash
npm install Huddly/icons-transpiler --save-dev
```

Add the following scripts to your `package.json`:

```json
...
"scripts": {
    "build": "icons",
    "readme": "icons readme",
},
...
```

Add `build.config.json` to your project root. It should look something like this:

```json
{
	"entry": "src",
	"output": ".",
	"generate": ["react", "vue"], // "react", "vue" supported and default
	"readme": {
		"output": "README.md",
		"template": "README.md.template"
	}
}
```

_This step is optional, by default the entry point is `./src` and the output is `.`. No README is generated by default._

#### Finally

Run `npm run build` to generate the icon components.

### Generate a README

Setup a `README.md.template` file in your project root. It should look something like this:

```markdown
# A title

A description

## Icon packages and imports

[icons-declaration]
```

The "[icons-declaration]" is a placeholder for the generated icons declaration.

You are free to change the placeholder name by adding a `declarationTag` property to the `readme` section of `build.config.json`.
