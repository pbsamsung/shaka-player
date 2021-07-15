
if ('undefined' !== tizen) {
	window.addEventListener("keydown", function (e) {
		switch (e.key) {
			case "XF86Back":
				tizen.application.getCurrentApplication().exit();
				break;
			default:
				console.log("Key code : " + e.key);
				break;
		}
	});
}



