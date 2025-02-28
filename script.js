function toggleMenu() {
    const navLinks = document.querySelector(".nav-links");
    navLinks.classList.toggle("active");
}

// Close menu when clicking outside of it
document.addEventListener("click", function (event) {
    const navLinks = document.querySelector(".nav-links");
    const hamburger = document.querySelector(".hamburger");

    if (!navLinks.contains(event.target) && !hamburger.contains(event.target)) {
        navLinks.classList.remove("active");
    }
});

// Close menu when clicking a link inside it
document.querySelectorAll(".nav-links a").forEach(link => {
    link.addEventListener("click", () => {
        document.querySelector(".nav-links").classList.remove("active");
    });
});

// Menu item hover to display image
const menuItems = document.querySelectorAll('.menu-item');
const previewImage = document.getElementById('menu-preview-image');

menuItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
        const imageSrc = item.getAttribute('data-image'); // Get the image path
        previewImage.src = imageSrc; // Set the preview image
        previewImage.classList.add('active'); // Make it visible
    });

    item.addEventListener('mouseleave', () => {
        previewImage.classList.remove('active'); // Hide the image
    });
});

// Popup functionality
const openPopupBtn = document.getElementById("open-menu-btn");
const popup = document.getElementById("menu-popup");
const closePopupBtn = document.querySelector(".close-btn");

openPopupBtn.addEventListener("click", () => {
    popup.style.display = "flex";
});

// Close popup when clicking on "X"
closePopupBtn.addEventListener("click", () => {
    popup.style.display = "none";
});

// Close popup when clicking outside the content
popup.addEventListener("click", (e) => {
    if (e.target === popup) {
        popup.style.display = "none";
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('newsletter-form');
    const emailInput = document.getElementById('email');
    const successMessage = document.getElementById('success-message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent page reload

        const email = emailInput.value.trim();
        if (!validateEmail(email)) {
            alert('Voer een geldig e-mailadres in.');
            return;
        }

        const data = {
            email_address: email,
            status: "subscribed"
        };

        try {
            const response = await fetch("https://usX.api.mailchimp.com/3.0/lists/YOUR_AUDIENCE_ID/members/", {
                method: "POST",
                headers: {
                    "Authorization": "apikey YOUR_MAILCHIMP_API_KEY",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                successMessage.style.display = 'block';
                emailInput.value = ''; // Clear input field
            } else {
                alert("Er is iets misgegaan. Probeer het opnieuw.");
            }
        } catch (error) {
            console.error("Error:", error);
        }
    });

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
});


document.addEventListener('DOMContentLoaded', () => {
    const galleryImages = document.querySelectorAll('.gallerywrapperimage');
    const imagePopup = document.getElementById('image-popup');
    const popupImage = document.getElementById('popup-image');
    const closePopup = document.getElementById('close-popup');
    const scrollLeft = document.getElementById('scroll-left');
    const scrollRight = document.getElementById('scroll-right');
    const galleryWrapper = document.querySelector('.gallery-container');

    // Ensure the popup is hidden by default
    imagePopup.style.display = 'none';

    // Open image in popup
    galleryImages.forEach(image => {
        image.addEventListener('click', () => {
            popupImage.src = image.src;
            imagePopup.style.display = 'flex';
        });
    });

    // Close popup
    closePopup.addEventListener('click', () => {
        imagePopup.style.display = 'none';
        popupImage.src = ''; // Clear the image source
    });

    // Close popup when clicking outside the image
    imagePopup.addEventListener('click', (e) => {
        if (e.target === imagePopup) {
            imagePopup.style.display = 'none';
            popupImage.src = '';
        }
    });

    // Scroll Gallery Left
    scrollLeft.addEventListener('click', () => {
        galleryWrapper.scrollBy({ left: -300, behavior: 'smooth' });
    });

    // Scroll Gallery Right
    scrollRight.addEventListener('click', () => {
        galleryWrapper.scrollBy({ left: 300, behavior: 'smooth' });
    });
});


// Contact Form Validation
const contactForm = document.querySelector('.contact-form form');
if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
        const name = this.name.value.trim();
        const email = this.email.value.trim();
        const message = this.message.value.trim();

        if (!name || !email || !message) {
            e.preventDefault();
            alert('Please fill out all fields before submitting.');
        } else if (!validateEmail(email)) {
            e.preventDefault();
            alert('Please enter a valid email address.');
        }
    });

    // Email Validation Function
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const events = document.querySelectorAll('.event');
    events.forEach(event => {
        // Assign a random animation delay between 0 and 2 seconds
        const randomDelay = Math.random() * 2;
        event.style.animationDelay = `${randomDelay}s`;

        // Add event listener to stop animation on hover
        event.addEventListener('mouseenter', () => {
            event.style.animation = 'none';
        });

        // Resume animation when the cursor leaves
        event.addEventListener('mouseleave', () => {
            event.style.animation = `bounce 2s infinite`;
        });
    });
});

document.addEventListener('DOMContentLoaded', () => {
        const galleryImages = document.querySelectorAll('.gallerywrapperimage');
        const imagePopup = document.getElementById('image-popup');
        const popupImage = document.getElementById('popup-image');

        // Ensure the popup is hidden by default
        imagePopup.style.display = 'none';

        galleryImages.forEach(image => {
            image.addEventListener('click', () => {
                popupImage.src = image.src;
                imagePopup.style.display = 'flex';
            });
        });

        imagePopup.addEventListener('click', () => {
            imagePopup.style.display = 'none';
            popupImage.src = ''; // Clear the image source
        });
});

let cart = [];
let totalPrice = 0;

function addToCart(productName, productPrice) {
    // Add product to cart
    cart.push({ name: productName, price: productPrice });
    totalPrice += productPrice;
    updateCart();
}

function updateCart() {
    const cartItems = document.getElementById('cart-items');
    const totalPriceElement = document.getElementById('total-price');

    // Clear current cart items
    cartItems.innerHTML = '';

    // Add each item to the cart display
    cart.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item.name} - €${item.price.toFixed(2)}`;
        cartItems.appendChild(li);
    });

    // Update total price
    totalPriceElement.textContent = `Total: €${totalPrice.toFixed(2)}`;
}

function checkout() {
    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }
    alert('Thank you for your purchase!');
    // Reset cart
    cart = [];
    totalPrice = 0;
    updateCart();
}
