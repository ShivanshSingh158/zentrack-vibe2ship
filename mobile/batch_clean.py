import os
import glob
from PIL import Image

def remove_dark_bg_smooth(input_path, output_path):
    print(f"Loading {input_path}")
    try:
        img = Image.open(input_path).convert("RGBA")
    except Exception as e:
        print(f"Error loading {input_path}: {e}")
        return
        
    data = img.getdata()
    new_data = []
    black_thresh = 15
    solid_thresh = 70
    
    for item in data:
        r, g, b, a = item
        lum = (r * 0.299 + g * 0.587 + b * 0.114)
        if lum <= black_thresh:
            new_data.append((0, 0, 0, 0))
        elif lum >= solid_thresh:
            new_data.append(item)
        else:
            alpha = int(((lum - black_thresh) / (solid_thresh - black_thresh)) * 255)
            new_data.append((r, g, b, alpha))
            
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"Saved to {output_path}")

downloads_dir = r"c:\Users\perso\Downloads"
output_dir = r"c:\Users\perso\.gemini\antigravity\scratch\zentrack-vibe2ship\mobile\assets\mascots"

mapping = {
    "shield": "level1.png",
    "helmet": "level2.png",
    "drone-eye": "level3.png",
    "lightning": "level4.png",
    "crystal": "level4.png",
    "sun-sphere": "level5.png",
    "dragon": "level6.png",
    "tesseract": "level7.png",
}

files = glob.glob(os.path.join(downloads_dir, "*.jpg")) + glob.glob(os.path.join(downloads_dir, "*.png"))
files.sort(key=os.path.getmtime, reverse=True)

for file in files[:20]: # look at 20 most recent
    basename = os.path.basename(file).lower()
    for key, output_name in mapping.items():
        if key in basename:
            out_path = os.path.join(output_dir, output_name)
            if not os.path.exists(out_path): # don't overwrite if already done
                print(f"Processing {basename} as {output_name}")
                remove_dark_bg_smooth(file, out_path)
