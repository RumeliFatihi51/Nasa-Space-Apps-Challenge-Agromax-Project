"""Prepare the licensed mission drone with independent rotor pivots.
Run Blender in background with --python this-file -- source.glb output.glb.
"""
import sys
from pathlib import Path
import bpy
from mathutils import Vector

source, target = [Path(value).resolve() for value in sys.argv[sys.argv.index("--")+1:]]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
propellers = bpy.data.objects.get("Propellers")
if propellers is None:
    rotors = [obj for obj in bpy.data.objects if obj.name.startswith("MissionRotor_")]
    if len(rotors) != 4:
        raise RuntimeError("Expected the licensed Innerscene model with four rotor meshes.")
else:
    bpy.ops.object.select_all(action="DESELECT")
    propellers.select_set(True)
    bpy.context.view_layer.objects.active = propellers
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    groups = {}
    for part in list(bpy.context.selected_objects):
        center = part.matrix_world @ (sum((vertex.co for vertex in part.data.vertices),Vector()) / len(part.data.vertices))
        groups.setdefault((center.x > 0, center.y > 0),[]).append(part)
    if len(groups) != 4:
        raise RuntimeError("Expected four separate rotor quadrants.")
    for index, parts in enumerate(groups.values()):
        # The central hub cap has the greatest mean height among these pieces.
        hub = max(parts,key=lambda part:sum((part.matrix_world @ vertex.co).z for vertex in part.data.vertices)/len(part.data.vertices))
        center = hub.matrix_world @ (sum((vertex.co for vertex in hub.data.vertices),Vector()) / len(hub.data.vertices))
        bpy.ops.object.select_all(action="DESELECT")
        for part in parts:
            part.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.join()
        rotor = bpy.context.object
        bpy.context.scene.cursor.location = center
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        rotor.name = f"MissionRotor_{index+1}"
        rotor["rotationAxis"] = "local-y-gltf"
target.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target),export_format="GLB",export_image_format="AUTO",export_extras=True)
print("MISSION_DRONE_READY",str(target),target.stat().st_size)
