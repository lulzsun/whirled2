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
