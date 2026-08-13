import sys
from PIL import Image

def remove_dark_bg(input_path, output_path, threshold=40):
    print(f"Loading {input_path}")
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    for item in data:
        # Check if pixel is dark (r, g, b are all below threshold)
        if item[0] < threshold and item[1] < threshold and item[2] < threshold:
            new_data.append((0, 0, 0, 0)) # Fully transparent
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"Saved to {output_path}")

if __name__ == "__main__":
    remove_dark_bg(sys.argv[1], sys.argv[2])
