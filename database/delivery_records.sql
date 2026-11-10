CREATE TABLE IF NOT EXISTS `delivery_records` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `delivery_date` DATE NOT NULL,
    `dr_number` VARCHAR(50) NOT NULL,
    `truck_plate` VARCHAR(20) NOT NULL,
    `customer_name` VARCHAR(191) NOT NULL,
    `location_id` INT NOT NULL,
    `destination` VARCHAR(255) NOT NULL,
    `post_length` SMALLINT NOT NULL,
    `price_php` INT NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_delivery_records_created` (`created_at`, `id`),
    KEY `idx_delivery_records_location` (`location_id`),
    CONSTRAINT `fk_delivery_records_location`
        FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
