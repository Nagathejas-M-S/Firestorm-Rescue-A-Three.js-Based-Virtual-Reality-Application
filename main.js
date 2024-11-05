// import './style.css';
import * as THREE from 'three';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'; 
let scene, camera, renderer, fireLight;

        function init() {
            // Create Scene
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x000000); // Night-like setting

            // Camera setup
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 4.5, 5);  // Adjust the camera position to look at the house

            // Renderer setup
            renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.querySelector('.canvas_webgl') });
            renderer.setSize(window.innerWidth, window.innerHeight);

            // Add light for fire effect
            fireLight = new THREE.PointLight(0xff4500, 2, 20);  // Orange fire-like light
            fireLight.position.set(0, 2, 0);  // Position inside house
            scene.add(fireLight);

            // Load 3D Model of house and character
            const loader = new THREE.GLTFLoader();
            loader.load('https://firestorm-rescue.vercel.app/house.glb', function (gltf) {
                const model = gltf.scene;
                scene.add(model);

        })

            // Animation Loop
            function animate() {
                requestAnimationFrame(animate);

                // Flicker effect for the fire light
                fireLight.intensity = 2 + Math.sin(Date.now() * 0.005); // Flickering effect

                // Slight camera movement to give dynamism
                camera.position.x += Math.sin(Date.now() * 0.1) * 0.001;

                // Update fire effect (simple animation)
                fireLight.position.y += Math.sin(Date.now() * 0.1) * 0.01; // Simulate fire height flicker

                renderer.render(scene, camera);
            }
            animate();
        }

        // Show the 3D scene when "Start Game" is clicked
        document.getElementById('start-button').addEventListener('click', function() {
            document.getElementById('ui-screen').style.display = 'none'; // Hide UI screen
            document.querySelector('canvas').style.display = 'block';   // Show canvas
            init();  // Initialize the Three.js scene
        });

        // Handle window resize
        window.addEventListener('resize', function() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });