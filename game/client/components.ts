import { defineComponent, Types } from "bitecs";

const { f32, eid } = Types;

export const Vector3Schema = { x: f32, y: f32, z: f32 };
export const QuaternionSchema = { x: f32, y: f32, z: f32, w: f32 };

export const TransformSchema = {
	position: Vector3Schema,
	rotation: QuaternionSchema,
	scale: Vector3Schema,
};

export type Vector3Component = {
	x: Float32Array;
	y: Float32Array;
	z: Float32Array;
};

export type QuaternionComponent = {
	x: Float32Array;
	y: Float32Array;
	z: Float32Array;
	w: Float32Array;
};

export type TransformComponentType = {
	position: Vector3Component;
	rotation: QuaternionComponent;
	scale: Vector3Component;
};

export const TransformComponent =
	defineComponent<TransformComponentType>(TransformSchema);

export const SpineComponent = defineComponent({ timeScale: f32 });

export const GltfComponent = defineComponent({ timeScale: f32 });

export const PlayerComponent = defineComponent();

export const LocalPlayerComponent = defineComponent();

export const MoveTowardsComponent =
	defineComponent<Vector3Component>(Vector3Schema);

export const NameplateComponent = defineComponent({ owner: eid });

export const ChatMessageComponent = defineComponent();
