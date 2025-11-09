import { addComponent, defineSystem } from "bitecs";
import { World } from "../factory/world";
import { createPlayer } from "../factory/player";
import * as buf from "../proto";
import { create } from "@bufbuild/protobuf";
import { TransformComponent, NameplateComponent } from "../components";
import { createNameplate } from "../factory/nameplate";

export function createPreviewSystem(world: World) {
	const dataset = world.renderer.domElement.dataset;

	const file = dataset.previewFile;
	const type = dataset.previewType;
	const scale = parseFloat(dataset.previewScale ?? "1");

	if (file === undefined && type === undefined) {
		console.error("error: file or type is undefined: ", file, type);
		return defineSystem((world: World) => {
			return world;
		});
	}

	console.log(file, type, scale);

	switch (type) {
		case "avatars": {
			const player: buf.Player = create(buf.PlayerSchema, {
				nickname: "Test",
				username: "Test",
				file: file,
				initialScale: scale,
			});
			(async () => {
				const playerEntity = await createPlayer(
					world,
					player.username,
					true,
					undefined,
					player.file ?? "",
					player.initialScale ?? 1,
				);
				const eid = playerEntity.eid;

				if (player.position === undefined) {
					player.position = create(buf.PositionSchema, {
						x: 0.0,
						y: -7.49,
						z: 0.0,
					});
				}

				TransformComponent.position.x[eid] = player.position.x;
				TransformComponent.position.y[eid] = player.position.y;
				TransformComponent.position.z[eid] = player.position.z;

				if (player.rotation === undefined) {
					player.rotation = create(buf.RotationSchema, {
						x: 0.0,
						y: 0,
						z: 0.0,
					});
				}

				TransformComponent.rotation.x[eid] = player.rotation.x;
				TransformComponent.rotation.y[eid] = player.rotation.y;
				TransformComponent.rotation.z[eid] = player.rotation.z;
				TransformComponent.rotation.w[eid] = player.rotation.w;
				playerEntity.rotation._onChangeCallback();

				if (player.scale === undefined) {
					player.scale = create(buf.ScaleSchema, {
						x: 1,
						y: 1,
						z: 1,
					});
				}

				TransformComponent.scale.x[eid] = player.scale.x;
				TransformComponent.scale.y[eid] = player.scale.y;
				TransformComponent.scale.z[eid] = player.scale.z;

				const nameplateEntity = createNameplate(world, player.nickname);
				addComponent(world, NameplateComponent, nameplateEntity.eid);
				NameplateComponent.owner[nameplateEntity.eid] = eid;

				if (player.local && player.owner) {
					document
						.getElementById("openEditorBtn")
						?.setAttribute("style", "");
				}

				world.players.set(eid, {
					player: playerEntity,
					nameplate: nameplateEntity,
				});
				world.scene.add(playerEntity);
				console.log("huh");
			})();
			break;
		}
		default:
			break;
	}

	return defineSystem((world: World) => {
		return world;
	});
}
