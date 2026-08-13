import sys
from rembg import remove
from PIL import Image

def remove_background(input_path, output_path):
    print(f"Loading image from {input_path}...")
    input_image = Image.open(input_path)
    print("Removing background...")
    output_image = remove(input_image)
    print(f"Saving cleaned image to {output_path}...")
    output_image.save(output_path)
    print("Done!")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python clean_bg.py <input_image> <output_image>")
        sys.exit(1)
    remove_background(sys.argv[1], sys.argv[2])
