from PIL import Image
import math

def remove_black_bg(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    pixels = img.load()
    width, height = img.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            # Calculate luminance or just max rgb
            max_val = max(r, g, b)
            if max_val < 5:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                # Smooth alpha transition for anti-aliasing
                # If the pixel is dark, make it partially transparent
                # This prevents hard black edges
                if max_val < 100:
                    alpha = int((max_val / 100.0) * 255)
                    # We also want to boost the color so it doesn't look dark
                    # but simple alpha scaling is usually enough
                    pixels[x, y] = (r, g, b, min(a, alpha))

    img.save(output_path, "PNG")

if __name__ == "__main__":
    import sys
    remove_black_bg(sys.argv[1], sys.argv[2])
    print("Done")
