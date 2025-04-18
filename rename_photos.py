import os

def rename_files_sequentially(directory):
    """
    Renames files in a given directory to a sequential numbering format (01, 02, 03, ...).

    Args:
        directory (str): The path to the directory containing the files to rename.
    """
    try:
        files = [f for f in os.listdir(directory) if os.path.isfile(os.path.join(directory, f))]
        files.sort() # Sort files to ensure consistent renaming order

        for index, filename in enumerate(files):
            # Get the file extension
            file_ext = os.path.splitext(filename)[1]
            # Create the new filename with sequential numbering (e.g., 01.jpg, 02.png)
            new_filename = f"{index + 1:02d}{file_ext}"
            
            old_filepath = os.path.join(directory, filename)
            new_filepath = os.path.join(directory, new_filename)

            # Rename the file
            os.rename(old_filepath, new_filepath)
            print(f"Renamed '{filename}' to '{new_filename}'")

    except FileNotFoundError:
        print(f"Error: Directory not found at '{directory}'")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # Define the directory containing the photos
    photo_directory = "manbo_photo"
    rename_files_sequentially(photo_directory)
