import sys
from PIL import Image

def remove_dark_bg_smooth(input_path, output_path):
    print(f"Loading {input_path}")
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    # threshold for fully transparent
    black_thresh = 35
    # threshold for fully opaque
    solid_thresh = 85
    
    for item in data:
        r, g, b, a = item
        # Calculate perceived brightness
        lum = (r * 0.299 + g * 0.587 + b * 0.114)
        
        if lum <= black_thresh:
            # Completely remove very dark pixels
            new_data.append((0, 0, 0, 0))
        elif lum >= solid_thresh:
            # Keep bright pixels fully opaque
            new_data.append(item)
        else:
            # Smoothly transition alpha between black_thresh and solid_thresh
            alpha = int(((lum - black_thresh) / (solid_thresh - black_thresh)) * 255)
            new_data.append((r, g, b, alpha))
            
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"Saved to {output_path}")

if __name__ == "__main__":
    remove_dark_bg_smooth(sys.argv[1], sys.argv[2])
