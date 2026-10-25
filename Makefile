.PHONY: install uninstall pack reload clean lint

install: ## install into the live session
	./install.sh

install-reload: ## install + in-place shell reload (X11)
	./install.sh --reload

uninstall: ## remove the extension
	./uninstall.sh

pack: ## build dist/update-watch@rich.shell-extension.zip
	./pack.sh

reload: ## restart the shell in place (apps survive on X11)
	killall -3 gnome-shell

lint: ## eslint (gjs rules) if configured
	eslint update-watch@rich/*.js

clean: ## remove build artifacts
	rm -rf dist
