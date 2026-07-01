from PIL import Image

def make_white_transparent(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    pixels = img.load()
    width, height = img.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            # Use the brightest channel as the alpha value
            # This turns the black background into complete transparency (alpha=0)
            # and the bright purple lines into opaque or semi-transparent (alpha>0)
            luminance = int(max(r, g, b))
            
            # We want the resulting logo to be pure white, 
            # with transparency representing the original shape and anti-aliasing
            pixels[x, y] = (255, 255, 255, luminance)

    img.save(output_path, "PNG")

if __name__ == "__main__":
    make_white_transparent("public/logo.png", "public/logo_white.png")
    print("Successfully created logo_white.png")
