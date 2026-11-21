/**
 * Cinematic techniques, camera motions, visual styles, and sound presets
 * optimized for MiniMax H3 Omni-Modal generation.
 */

export const TECHNIQUES = {
  // --- Camera Movements ---
  orbit_360: {
    category: "Camera Movement",
    label: "360° Orbit",
    description: "Smooth 360-degree orbital rotation around the central subject.",
    promptModifier: "360-degree smooth orbital camera rotation around the subject, keeping focal point locked in center, steady cinematic gimbal movement",
  },
  dolly_in: {
    category: "Camera Movement",
    label: "Dolly In (Push)",
    description: "Slow, dramatic forward camera push towards the subject.",
    promptModifier: "Slow dramatic dolly in, camera pushing forward steadily toward the subject, shallow depth of field intensifying",
  },
  dolly_out: {
    category: "Camera Movement",
    label: "Dolly Out (Pull)",
    description: "Camera pulls backward slowly to reveal the wider scene.",
    promptModifier: "Slow cinematic dolly zoom out, camera pulling backward smoothly revealing the expansive environment",
  },
  fpv_speed_run: {
    category: "Camera Movement",
    label: "FPV High-Speed Fly-Through",
    description: "Fast, dynamic first-person perspective weaving through the environment.",
    promptModifier: "Dynamic high-speed FPV drone shot, banking turns, rushing forward low to the ground with motion blur along edges",
  },
  drone_overhead: {
    category: "Camera Movement",
    label: "Overhead Drone Sweep",
    description: "High-angle bird's eye view descending or sweeping across.",
    promptModifier: "Sweeping high-altitude aerial drone shot, descending smoothly with expansive horizon line",
  },
  tracking_shot: {
    category: "Camera Movement",
    label: "Tracking / Following Shot",
    description: "Camera tracks parallel with subject moving through scene.",
    promptModifier: "Fluid tracking shot moving alongside the subject at matching speed, cinematic steadicam",
  },
  low_angle_hero: {
    category: "Camera Movement",
    label: "Low-Angle Hero Shot",
    description: "Camera looking up from below, conveying power and scale.",
    promptModifier: "Low angle hero perspective looking up, dramatic towering presence, atmospheric sky background",
  },
  bullet_time: {
    category: "Camera Movement",
    label: "Bullet Time Slow Motion",
    description: "Extreme slow motion with camera sliding around the moment.",
    promptModifier: "Hyper slow-motion bullet time effect, particles suspended in air, seamless camera sweep around frozen action",
  },

  // --- Visual Styles & Lighting ---
  golden_hour: {
    category: "Lighting & Style",
    label: "Golden Hour Glow",
    description: "Warm, low-angle sunset/sunrise light with lens flares.",
    promptModifier: "Bathed in warm golden hour sunlight, long dramatic shadows, soft rim lighting, subtle anamorphic lens flare",
  },
  cyberpunk_neon: {
    category: "Lighting & Style",
    label: "Cyberpunk Neon Rain",
    description: "Vibrant cyan and magenta neons reflecting off wet pavements.",
    promptModifier: "Cyberpunk aesthetic, glowing cyan and magenta neon signage, slick rain-soaked streets with crisp reflections, volumetric haze",
  },
  cinematic_film: {
    category: "Lighting & Style",
    label: "35mm Cinematic Film",
    description: "Rich color grading, fine film grain, Kodak 5207 tone.",
    promptModifier: "Shot on 35mm motion picture film, fine organic grain, Kodachrome color science, natural contrast, cinematic depth",
  },
  film_noir: {
    category: "Lighting & Style",
    label: "Film Noir Chiaroscuro",
    description: "High contrast black & white shadows and venetian blind light.",
    promptModifier: "Moody film noir atmosphere, stark chiaroscuro lighting, deep silhouetted shadows, drifting cigarette smoke",
  },
  macro_intimate: {
    category: "Lighting & Style",
    label: "Macro Close-Up",
    description: "Extreme detail, ultra-shallow depth of field, creamy bokeh.",
    promptModifier: "Extreme macro lens perspective, razor-thin focal plane, creamy blurred background bokeh, intricate micro-textures",
  },
  volumetric_fog: {
    category: "Lighting & Style",
    label: "Volumetric God Rays",
    description: "Light shafts piercing through heavy fog or dust.",
    promptModifier: "Dramatic volumetric god rays beaming through atmospheric morning mist, silhouetted shapes, divine ethereal atmosphere",
  },

  // --- Omni-Modal Audio Design (MiniMax H3 Native) ---
  audio_cinematic_orchestral: {
    category: "Audio Design",
    label: "Cinematic Orchestral",
    description: "Deep orchestral strings, swelling brass, and subtle bass hits.",
    promptModifier: "Accompanying rich cinematic orchestral score, low cello swells, poignant piano notes, professional mastering",
  },
  audio_ambient_nature: {
    category: "Audio Design",
    label: "Ambient Nature & Foley",
    description: "Crisp natural wind, rustling leaves, distant birds, footsteps.",
    promptModifier: "Authentic ambient natural soundscape, gentle breeze rustling leaves, subtle crisp foley footsteps, spatial audio",
  },
  audio_synthwave: {
    category: "Audio Design",
    label: "Synthwave Pulse",
    description: "80s retro synth arpeggios, gated reverb drums, analog warmth.",
    promptModifier: "Driving 80s analog synthwave pulse, warm bass synthline, steady retro beat matching the visual tempo",
  },
  audio_sci_fi_hum: {
    category: "Audio Design",
    label: "Sci-Fi Atmosphere",
    description: "Low reactor hum, electronic chirps, futuristic air seals.",
    promptModifier: "Immersive futuristic atmosphere, low sub-bass reactor resonance, mechanical hydraulic hiss, spatial acoustic reverb",
  },
};

/**
 * Augments a base prompt with one or more techniques.
 */
export function applyTechniques(basePrompt, techniqueKeys = []) {
  if (!techniqueKeys || !techniqueKeys.length) return basePrompt;
  const modifiers = techniqueKeys
    .map((k) => TECHNIQUES[k]?.promptModifier)
    .filter(Boolean);
  if (!modifiers.length) return basePrompt;
  return `${basePrompt.trim()}, ${modifiers.join(", ")}`;
}
