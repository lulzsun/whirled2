import '../../web/static/styles.css'
import * as THREE from 'three';
import geckos from '@geckos.io/client'

function main() {
	const canvas = document.querySelector<HTMLDivElement>('#app')!;
	const renderer = new THREE.WebGLRenderer({antialias: true, canvas});

	const fov = 75;
	const aspect = 2; // the canvas default
	const near = 0.1;
	const far = 5;
	const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
	camera.position.z = 0.5;

	const scene = new THREE.Scene();
	{
		const color = 0xFFFFFF;
		const intensity = 3;
		const light = new THREE.DirectionalLight( color, intensity );
		light.position.set(-1, 2, 4);
		scene.add(light);
	}

	const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const material = new THREE.MeshNormalMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

	function resizeRendererToDisplaySize(renderer: THREE.WebGLRenderer) {
		const canvas = renderer.domElement;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		const needResize = canvas.width !== width || canvas.height !== height;
		if (needResize) {
			renderer.setSize( width, height, false );
		}
		return needResize;
	}

	function render(time: number) {
		time *= 0.001;
		if (resizeRendererToDisplaySize(renderer)) {
			const canvas = renderer.domElement;
			camera.aspect = canvas.clientWidth / canvas.clientHeight;
			camera.updateProjectionMatrix();
		}

    const speed = 1 + 0 * .1;
    const rot = time * speed;
    mesh.rotation.x = rot;
    mesh.rotation.y = rot;

		renderer.render(scene, camera);
		requestAnimationFrame(render);
	}
	requestAnimationFrame(render);
}

main();

// init geckos.io
const channel = geckos({ port: 9696 })

channel.onConnect(error => {
  if (error) {
    console.error(error.message)
    return
  }

  console.log('connected')

  // Example of sending and recieving from server
  // Client will send the event 'ping' with data 'hello'
  // Client will recieve the event 'pong' with data 'world'
  channel.on('pong', data => {
    console.log(`Server sent event 'pong' with data '${data}'`)
  })

  channel.emit('ping', 'hello', {
    reliable: false,
    interval: 150,
    runs: 10,
  })
})