from PIL import Image
import io

def crop_image(image_bytes, x, y, w, h):
    """
    Crops the image to the specified rectangle.
    
    Args:
        image_bytes (bytes): The input image data.
        x (int): The x-coordinate of the top-left corner.
        y (int): The y-coordinate of the top-left corner.
        w (int): The width of the crop.
        h (int): The height of the crop.
        
    Returns:
        bytes: The cropped image data in PNG format.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        
        # Ensure crop is within bounds
        img_w, img_h = img.size
        x = max(0, min(x, img_w - 1))
        y = max(0, min(y, img_h - 1))
        w = max(1, min(w, img_w - x))
        h = max(1, min(h, img_h - y))
        
        cropped_img = img.crop((x, y, x + w, y + h))
        
        output_buffer = io.BytesIO()
        cropped_img.save(output_buffer, format="PNG")
        return output_buffer.getvalue()
    except Exception as e:
        print(f"Error in crop_image: {e}")
        raise

def crop_to_ratio(image_bytes, ratio_str):
    """
    Crops the image to the specified aspect ratio (center crop).
    
    Args:
        image_bytes (bytes): The input image data.
        ratio_str (str): The target aspect ratio, e.g., "1:1", "4:3", "16:9".
        
    Returns:
        bytes: The cropped image data in PNG format.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img_w, img_h = img.size
        
        try:
            w_ratio, h_ratio = map(int, ratio_str.split(':'))
        except ValueError:
            # Default to 1:1 if parsing fails
            w_ratio, h_ratio = 1, 1
            
        target_ratio = w_ratio / h_ratio
        current_ratio = img_w / img_h
        
        if current_ratio > target_ratio:
            # Image is wider than target, crop width
            new_w = int(img_h * target_ratio)
            offset = (img_w - new_w) // 2
            box = (offset, 0, offset + new_w, img_h)
        else:
            # Image is taller than target, crop height
            new_h = int(img_w / target_ratio)
            offset = (img_h - new_h) // 2
            box = (0, offset, img_w, offset + new_h)
            
        cropped_img = img.crop(box)
        
        output_buffer = io.BytesIO()
        cropped_img.save(output_buffer, format="PNG")
        return output_buffer.getvalue()
    except Exception as e:
        print(f"Error in crop_to_ratio: {e}")
        raise

def expand_image(image_bytes, ratio=1.5):
    """
    Expands the image canvas by adding whitespace/transparency around it.
    Used for outpainting.
    
    Args:
        image_bytes (bytes): The input image data.
        ratio (float): The expansion ratio (e.g., 1.5 means 1.5x larger canvas).
        
    Returns:
        bytes: The expanded image data in PNG format.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img_w, img_h = img.size
        
        new_w = int(img_w * ratio)
        new_h = int(img_h * ratio)
        
        # Create new image with white background (or transparent)
        # Using white helps AI understand it needs to fill it
        new_img = Image.new("RGB", (new_w, new_h), (255, 255, 255))
        
        # Paste original image in center
        offset_x = (new_w - img_w) // 2
        offset_y = (new_h - img_h) // 2
        new_img.paste(img, (offset_x, offset_y))
        
        output_buffer = io.BytesIO()
        new_img.save(output_buffer, format="PNG")
        return output_buffer.getvalue()
    except Exception as e:
        print(f"Error in expand_image: {e}")
        raise

def resize_to_dimensions(image_bytes, target_width, target_height, maintain_quality=True):
    """
    调整图片到指定尺寸
    
    Args:
        image_bytes (bytes): 输入图片数据
        target_width (int): 目标宽度
        target_height (int): 目标高度
        maintain_quality (bool): 是否使用高质量算法
        
    Returns:
        bytes: 调整后的图片数据（PNG 格式）
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        current_width, current_height = img.size
        
        # 如果尺寸已经匹配，直接返回
        if current_width == target_width and current_height == target_height:
            output_buffer = io.BytesIO()
            img.save(output_buffer, format="PNG", quality=95)
            return output_buffer.getvalue()
        
        # 使用高质量重采样算法
        resample = Image.Resampling.LANCZOS if maintain_quality else Image.Resampling.BILINEAR
        resized_img = img.resize((target_width, target_height), resample)
        
        output_buffer = io.BytesIO()
        resized_img.save(output_buffer, format="PNG", quality=95)
        return output_buffer.getvalue()
    except Exception as e:
        print(f"Error in resize_to_dimensions: {e}")
        raise
