const config = require('./config')

const BAMARAMA_BOX = 80086,
	ROOT_BEER = 80081,
	TRASH = {
		80078: 'beer',
		80079: 'wine',
		80080: 'lotus',
		80082: 'moongourd',
		80089: 'afro',
		80090: 'chefHat'
	},
	HATS = [80089, 80090], // Afro, Chef's
	ITEMS = [ROOT_BEER, ...Object.keys(TRASH).map(id => Number(id))]

const Command = require('command')

module.exports = function RootBeer(dispatch) {
	const command = Command(dispatch)

	let hooks = [],
		gameId = null,
		enabled = false,
		timer = null,
		myLocation = null,
		statTotal = 0,
		statRootBeers = 0,
		invenHook = null

	command.add('rootbeer', () => {
		if(enabled = !enabled) {
			load()
			openBox()
			command.message('Auto-Rootbeer started.')
		}
		else stop()
	})

	dispatch.hook('S_LOGIN', 10, event => { ({gameId} = event) })
	dispatch.hook('S_SPAWN_ME', 2, event => { myLocation = event })
	dispatch.hook('C_PLAYER_LOCATION', 3, event => { myLocation = event })

	function openBox() {
		dispatch.toServer('C_USE_ITEM', 3, {
			gameId,
			id: BAMARAMA_BOX,
			amount: 1,
			loc: myLocation.loc,
			w: myLocation.w,
			unk4: true
		})

		timer = setTimeout(openBox, 5000) // Fallback in case a box failed to open
	}

	function stop() {
		clearTimeout(timer)
		unload()
		enabled = false
		command.message('Auto-Rootbeer stopped.' + (!statTotal ? '' : ` Unboxed ${statRootBeers}/${statTotal} (${(Math.floor(statRootBeers / statTotal * 1000) / 10) || '0'}%).`))
		statTotal = statRootBeers = 0
	}

	function load() {
		function hook() { hooks.push(dispatch.hook(...arguments)) }

		let invenItems = null

		if(invenHook) dispatch.unhook(invenHook)

		invenHook = dispatch.hook('S_INVEN', 12, event => {
			invenItems = event.first ? event.items : invenItems.concat(event.items)

			if(!event.more) {
				let used = 0

				if(config.autoTrash)
					for(let item of invenItems)
						if(item.slot >= 40)
							used++

				const strictTrash = event.size - used < 2,
					hats = []

				let box = false, idx = -1

				for(let i in HATS) hats.push([])

				for(let item of invenItems) {
					if(item.slot < 40) continue // First 40 slots are reserved for equipment, etc.

					if(item.id == BAMARAMA_BOX) box = true
					else if(config.autoTrash)
						for(let id in TRASH)
							if(item.id === Number(id)) {
								// Trashing large stacks of items is more bandwidth efficient
								if(config.autoTrashItems[TRASH[id]] && (strictTrash || HATS.includes(item.id) || item.amount >= 99 || !enabled))
									deleteItem(item.slot, item.amount)

								break
							}
					else if((idx = HATS.indexOf(item.id)) !== -1) hats[idx].push(item.slot)
				}

				for(let hat of hats)
					while(hat.length >= 2) mergeItem(hat.pop(), hat[0])

				if(!box) stop()

				invenItems = null

				if(!enabled) dispatch.unhook(invenHook) // Unhook after we've cleaned up
			}
		})

		hook('S_SYSTEM_MESSAGE_LOOT_ITEM', 1, event => {
			if(ITEMS.includes(event.item)) {
				clearTimeout(timer)

				statTotal++
				if(event.item === ROOT_BEER) statRootBeers++

				openBox()
			}
		})

		hook('C_RETURN_TO_LOBBY', 'raw', () => false) // Prevents you from being automatically logged out while AFK
	}

	function unload() {
		if(hooks.length) {
			for(let h of hooks) dispatch.unhook(h)

			hooks = []
		}
	}

	function deleteItem(slot, amount) {
		dispatch.toServer('C_DEL_ITEM', 2, {
			gameId,
			slot: slot - 40,
			amount
		})
	}

	function mergeItem(slotFrom, slotTo) {
		dispatch.toServer('C_MERGE_ITEM', 1, {slotFrom, slotTo})
	}
}