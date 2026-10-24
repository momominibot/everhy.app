# From Rhythme (ovumind tools/art/3d/fix_weights.py, commit 9a80eb2), used as is for the EveRhy 3D avatar.
# Blender: repair Rhea's sleeve and cuff skin weights with Robust Weight Transfer's inpainting (free, GPL; Abdrashitov et al.,
# SIGGRAPH Asia 2023). Her body, hands and legs keep Meshy's weights; the loose parts of each sleeve (far from the arm bones)
# and the cuffs are marked unknown and filled smoothly from their neighbours, which is what stops the tearing.
# blender -b -P fix_weights.py -- <rigged.glb> <out.glb> [sleeve_gap_m] [cuff_radius_m]
import bpy, sys, os, mathutils, numpy as np
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]; GAP = float(argv[2]) if len(argv) > 2 else 0.03; CUFF = float(argv[3]) if len(argv) > 3 else 0.035
RWT = os.environ['RWT']   # the add-on folder with its deps
sys.path.append(os.path.join(RWT, 'deps')); sys.path.append(os.path.join(RWT, 'src26', 'robust-weight-transfer-libigl26'))
import weighttransfer as wt

bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
body = max((o for o in sc.objects if o.type == 'MESH' and not o.name.lower().startswith('icosphere')), key=lambda o: len(o.data.vertices))
me = body.data; mw = body.matrix_world; aw = arm.matrix_world
V = np.array([tuple(mw @ v.co) for v in me.vertices], dtype=np.float64)
me.calc_loop_triangles(); F = np.array([tuple(t.vertices) for t in me.loop_triangles], dtype=np.int64)
names = [g.name for g in body.vertex_groups]; idx = {n: i for i, n in enumerate(names)}
W = np.zeros((len(V), len(names)), dtype=np.float64)
for v in me.vertices:
    for ge in v.groups: W[v.index, ge.group] = ge.weight
def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1); return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
B = {b.name: (np.array(aw @ b.head_local), np.array(aw @ b.tail_local)) for b in arm.data.bones}
unknown = np.zeros(len(V), bool)
for side in ('Left', 'Right'):
    chain = [side + 'Arm', side + 'ForeArm']
    arm_w = sum(W[:, idx[n]] for n in chain + [side + 'Hand'] if n in idx)
    # EveRhy: bare arms, so measure from the hand bone too; otherwise her hands count as 'far from the arm' and lose their weights
    d = np.minimum.reduce([seg_dist(V, *B[n]) for n in chain + [side + 'Hand'] if n in B])
    # the loose sleeve: arm-weighted vertices standing well off the bones
    unknown |= (arm_w > 0.05) & (d > GAP)
    # the cuff ring around the wrist, but not the hand itself
    wrist = B[side + 'Hand'][0]; hand_dir = B[side + 'Hand'][1] - wrist; hand_dir /= max(np.linalg.norm(hand_dir), 1e-9)
    along = (V - wrist) @ hand_dir
    near_wrist = np.linalg.norm(V - wrist, axis=1) < CUFF
    unknown |= near_wrist & (along < 0.012)
known = ~unknown
print('vertices', len(V), 'unknown', int(unknown.sum()), 'bones', len(names))
def harmonic(V, F, W, known):
    # the same smooth fill, solved as a harmonic interpolation on the mesh's own edges (robust on large meshes)
    import scipy.sparse as sp, scipy.sparse.linalg as sla
    n = len(V); e = np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); e = np.vstack([e, e[:, ::-1]])
    A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr(); A.data[:] = 1.0
    L = sp.diags(np.asarray(A.sum(1)).ravel()) - A
    u = np.nonzero(~known)[0]; k = np.nonzero(known)[0]
    Luu = L[u][:, u].tocsc(); Luk = L[u][:, k]
    out = W.copy(); rhs = -(Luk @ W[k]); solve = sla.factorized(Luu + sp.identity(len(u)) * 1e-9)
    for j in range(W.shape[1]): out[u, j] = solve(np.asarray(rhs[:, j]).ravel())
    return out
# Meshy's mesh is split into islands (vertices on shared edges are not welded): weld by position for the maths only
q = np.round(V / 1e-5).astype(np.int64); _, wid, inv = np.unique(q, axis=0, return_index=True, return_inverse=True); inv = inv.ravel()
nw = len(wid); Vw = V[wid]; Fw = inv[F]
Ww = np.zeros((nw, W.shape[1])); cnt = np.zeros(nw); np.add.at(Ww, inv, W); np.add.at(cnt, inv, 1); Ww /= np.maximum(cnt, 1)[:, None]
kw = np.ones(nw, bool); np.logical_and.at(kw, inv, known)   # a welded point is known only if every copy is known
print('welded', len(V), '->', nw, 'unknown', int((~kw).sum()))
try:
    Wnw = wt.inpaint(Vw, Fw, Ww, kw, False)
except Exception as e:
    print('inpaint failed, harmonic fill instead:', e); Wnw = harmonic(Vw, Fw, Ww, kw)
Wn = Wnw[inv]
Wn = np.clip(Wn, 0, 1)
# SKIRT=1: a skirt follows her hips. Vertices between hip and knee that flare away from the leg bones take 75% hips and
# keep 25% of their leg weights, so the skirt sways a little without splitting between her legs.
if os.environ.get('SKIRT') == '1' and 'Hips' in idx:
    hz = B['Hips'][0][2]; kz = min(B['LeftLeg'][0][2], B['RightLeg'][0][2])
    legs = [n for n in ('LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg') if n in idx]
    leg_w = sum(Wn[:, idx[n]] for n in legs)
    dleg = np.minimum.reduce([seg_dist(V, *B[n]) for n in ('LeftUpLeg', 'RightUpLeg') if n in B])
    sk = (V[:, 2] < hz + 0.01) & (V[:, 2] > kz - 0.02) & (leg_w > 0.3) & (dleg > float(os.environ.get('SKIRT_GAP', '0.035')))
    keep = Wn[sk] * 0.25; keep[:, idx['Hips']] += 0.75 * 1.0
    Wn[sk] = keep; print('skirt vertices', int(sk.sum()))
# at most four bones per vertex, renormalised
order = np.argsort(-Wn, axis=1); keep = np.zeros_like(Wn, bool); np.put_along_axis(keep, order[:, :4], True, axis=1)
Wn = np.where(keep, Wn, 0); Wn /= np.maximum(Wn.sum(1, keepdims=True), 1e-9)
for j, n in enumerate(names):
    g = body.vertex_groups[n]; g.remove(list(range(len(V))))
    nz = np.nonzero(Wn[:, j] > 1e-4)[0]
    for i in nz: g.add([int(i)], float(Wn[i, j]), 'REPLACE')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB')
print('FIXED', out, 'changed', int(unknown.sum()))
