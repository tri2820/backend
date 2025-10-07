import type { MediaUnit } from "../../conn";

export const maskedMediaUnit = (mu: MediaUnit & ({
    _distance?: number
})) => ({ id: mu.id, description: mu.description, at_time: mu.at_time, media_id: mu.media_id, _distance: mu._distance })