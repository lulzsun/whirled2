declare namespace htmx {
	/**
	 * Processes new content, enabling htmx behavior. This can be useful if you have content that is added to the DOM outside of the normal htmx request cycle but still want htmx attributes to work.
	 * @param {HTMLElement} elt - element to process
	 * @returns {void}
	 */
	function process(elt: HTMLElement): void;
}
