import os
import struct

def png_to_ico(png_path, ico_path):
    if not os.path.exists(png_path):
        print(f"Error: Source file {png_path} does not exist.")
        return False
        
    with open(png_path, 'rb') as f:
        png_data = f.read()
        
    png_size = len(png_data)
    
    # ICO Header:
    # 2 bytes: Reserved (0)
    # 2 bytes: Type (1 for ico)
    # 2 bytes: Count (1 image)
    ico_header = struct.pack('<HHH', 0, 1, 1)
    
    # Directory Entry (16 bytes):
    # 1 byte: Width (0 for 256)
    # 1 byte: Height (0 for 256)
    # 1 byte: Color count (0 if >= 8bpp)
    # 1 byte: Reserved (0)
    # 2 bytes: Color planes (1)
    # 2 bytes: Bits per pixel (32)
    # 4 bytes: Size of image data
    # 4 bytes: Offset of image data from beginning of file (22)
    dir_entry = struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, png_size, 22)
    
    with open(ico_path, 'wb') as f:
        f.write(ico_header)
        f.write(dir_entry)
        f.write(png_data)
        
    print(f"Successfully converted {png_path} to {ico_path}")
    return True

if __name__ == '__main__':
    src = "icon.png"
    dest = "favicon.ico"
    png_to_ico(src, dest)
