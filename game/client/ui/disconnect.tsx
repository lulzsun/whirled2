export const createDisconnectUI = (reason: string) => {
	return (
		<div className="absolute w-full h-full flex items-center justify-center bg-black bg-opacity-50">
			<div className="flex flex-col space-y-2 rounded-lg p-2 text-gray-900 border border-gray-300 bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
				<span>{reason}</span>
				<div className="flex w-full justify-center">
					<button
						data-modal-hide="default-modal"
						type="button"
						class="w-auto py-2.5 px-5 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
						onClick={() => location.reload()}
					>
						Reload
					</button>
				</div>
			</div>
		</div>
	) as HTMLElement;
};
