module.exports = function (source) {
	const assignment = 'templateContainer.innerHTML = unsafeToTrustedHTML('
	const fragment = 'const template = templateContainer.content;'

	if (source.split(assignment).length !== 2 || source.split(fragment).length !== 2) {
		throw new Error('Unexpected Vue static-content parser; review vue-static-content-loader.cjs.')
	}

	// Vue supplies compiler-generated static HTML here, not user input.
	// Preserve template parsing, including table elements and namespace wrappers.
	return source
		.replace(assignment, 'const staticHTML = (')
		.replace(fragment, `const template = new DOMParser().parseFromString(
        unsafeToTrustedHTML("<template>" + staticHTML + "</template>"),
        "text/html"
      ).head.firstChild.content;`)
}
