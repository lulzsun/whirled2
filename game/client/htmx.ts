export declare namespace htmx {
	/**
	 * Processes new content, enabling htmx behavior. This can be useful if you have content that is added to the DOM outside of the normal htmx request cycle but still want htmx attributes to work.
	 * @param {HTMLElement} elt - element to process
	 * @returns {void}
	 */
	function process(elt: HTMLElement): void;
}

export const initializeHtmx = () => {
	document.addEventListener("htmx:afterRequest", function (evt: any) {
		closeCommentReplyBox(evt);
	});
};

// Closes comment reply box after HTMX successfully makes a request
function closeCommentReplyBox(evt: any) {
	if (evt.detail.failed) {
		return;
	}
	const target = document.getElementById(
		(evt.detail.target.id as string).replace(
			"_comment_children",
			"_comment_reply",
		),
	);
	if (target !== null) {
		(target as HTMLInputElement).checked = false;
	}
	const emptyPlaceholder = document.getElementById("msg_no_profile_comments");
	if (emptyPlaceholder !== null) {
		emptyPlaceholder.remove();
	}
}
