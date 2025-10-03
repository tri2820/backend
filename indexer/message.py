import json
import struct

def create_message(header: dict, buffer: bytes = None) -> bytes | str:
    """
    Creates a message for WebSocket communication.

    If a buffer is provided, it creates a binary message with the format:
    [4-byte header length][UTF-8 encoded header][buffer]

    Otherwise, it returns a JSON string of the header.

    Args:
        header: A dictionary to be sent as the message header.
        buffer: An optional bytes object for the binary payload.

    Returns:
        A bytes object for a binary message or a string for a JSON message.
    """
    # Using a replacer is good practice if you need to handle complex types
    # like large integers, but for standard JSON, a direct dump is fine.
    header_string = json.dumps(header)

    if buffer:
        header_buffer = header_string.encode('utf-8')
        # Pack the header length as a 4-byte, big-endian, unsigned integer.
        # The '>' character specifies big-endian byte order.
        # The 'I' character specifies an unsigned int (4 bytes).
        length_buffer = struct.pack('>I', len(header_buffer))
        return length_buffer + header_buffer + buffer

    return header_string

def parse_ws_message(message: bytes | str) -> dict:
    """
    Parses an incoming WebSocket message.

    This function can handle both string (JSON) and binary messages.

    Args:
        message: The incoming message, either as a string or bytes.

    Returns:
        A dictionary containing the header and an optional buffer.
        If an error occurs, it will be in the 'error' key.
    """
    try:
        if isinstance(message, str):
            # The message is a simple JSON string
            header = json.loads(message)
            return {"header": header}

        # The message is binary, so we need to decode it
        if not isinstance(message, bytes):
            raise TypeError("Binary message must be of type bytes")

        # 1. Unpack the header length from the first 4 bytes.
        # The '>' specifies big-endian, and 'I' specifies an unsigned int.
        header_length = struct.unpack('>I', message[:4])[0]

        # 2. Define the start and end points for the header and buffer
        header_start = 4
        buffer_start = header_start + header_length

        # 3. Decode the header from a UTF-8 string to a dictionary
        header_string = message[header_start:buffer_start].decode('utf-8')
        header = json.loads(header_string)

        # 4. Extract the buffer if it exists
        if len(message) > buffer_start:
            buffer = message[buffer_start:]
            return {"header": header, "buffer": buffer}
        else:
            return {"header": header}

    except (json.JSONDecodeError, struct.error, TypeError, UnicodeDecodeError) as e:
        print(f"Failed to parse WebSocket message: {e}")
        return {"header": {}, "error": e}

# --- Example Usage ---

if __name__ == "__main__":
    # --- Test Case 1: Simple JSON message (no buffer) ---
    print("--- Testing JSON Message ---")
    json_header = {"type": "greeting", "content": "Hello, world!"}
    created_json_message = create_message(json_header)
    print(f"Created JSON Message: {created_json_message}")

    parsed_json_message = parse_ws_message(created_json_message)
    print(f"Parsed JSON Message: {parsed_json_message}\n")


    # --- Test Case 2: Binary message with a buffer ---
    print("--- Testing Binary Message ---")
    binary_header = {"type": "image_data", "format": "jpeg", "id": 12345}
    # Simulate some image data
    image_buffer = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR...'

    created_binary_message = create_message(binary_header, image_buffer)
    print(f"Created Binary Message (first 50 bytes): {created_binary_message[:50]}...")

    parsed_binary_message = parse_ws_message(created_binary_message)
    print(f"Parsed Binary Header: {parsed_binary_message.get('header')}")
    print(f"Parsed Binary Buffer (first 10 bytes): {parsed_binary_message.get('buffer', b'')[:10]}...")